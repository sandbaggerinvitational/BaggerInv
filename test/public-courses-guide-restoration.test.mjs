import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalPublicCourseId,
  publicCourseDetailContent,
  publicCourseDirectory,
} from "../app/courses/public-course-model.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public course directory combines certified history and current Guide with stable aliases", () => {
  const historical = {
    aliases: { PDC02: "PDC01" },
    allAppearances: [
      { "Course ID": "OLD01", Course: "Old Club", City: "Old", State: "TX", Designer: "Architect" },
      { "Course ID": "PDC01", Course: "Pete Dye Course", City: "French Lick", State: "IN" },
    ],
  };
  const guide = {
    courses: [
      { "Course ID": "PDC02", Course: "Pete Dye Course", "Course Logo": "pete-dye", Designer: "Pete Dye" },
      { "Course ID": "NEW01", Course: "New Club", City: "New", State: "SC" },
    ],
  };
  const courses = publicCourseDirectory(historical, guide);
  assert.deepEqual(courses.map((course) => course["Course ID"]), ["NEW01", "OLD01", "PDC01"]);
  assert.equal(courses.find((course) => course["Course ID"] === "PDC01").Designer, "Pete Dye");
  assert.equal(canonicalPublicCourseId("pdc02", historical.aliases), "PDC01");
});

test("public course detail input canonicalizes current, historical, and hole rows", () => {
  const content = publicCourseDetailContent({
    aliases: { PDC02: "PDC01" },
    allAppearances: [{ "Course ID": "PDC02", Year: 2023 }],
    completedHoleRows: [{ "Course ID": "PDC02", "Hole Number": 1 }],
  }, {
    courses: [{ "Course ID": "PDC02", Course: "Pete Dye Course" }],
    courseHoles: [{ "Course ID": "PDC02", "Hole Number": 2 }],
  });
  assert.equal(content.courses[0]["Course ID"], "PDC01");
  assert.equal(content.courseArchive[0]["Course ID"], "PDC01");
  assert.deepEqual(content.courseHoles.map((hole) => hole["Course ID"]), ["PDC01", "PDC01"]);
});

test("bare Courses restores the all-host website while participant Courses keeps its PWA presentation", async () => {
  const [route, directory, detail] = await Promise.all([
    source("app/courses/page.js"),
    source("app/courses/PublicCoursesPage.js"),
    source("app/courses/[courseId]/PublicCoursePage.js"),
  ]);
  assert.match(route, /if \(!participantPresentation\) return <PublicCoursesPage env=\{env\} \/>/);
  assert.match(route, /resolveTournamentGuideContent\(\{ surface: "course", env \}\)/);
  assert.match(route, /View Course Archive/);
  assert.match(directory, /loadHistoricalCourseModel\(\{ env \}\)/);
  assert.match(directory, /resolveTournamentGuideContent\(\{ surface: "course", env \}\)/);
  assert.match(directory, /The Venues/);
  assert.match(directory, /Every course that has hosted a round of The Sandbagger Invitational/);
  for (const heading of ["Course Details", "Sandbagger History", "Course Statistics", "Course Holes"]) {
    assert.match(detail, new RegExp(heading));
  }
  assert.match(detail, /historicalModel\.aliases/);
  assert.match(detail, /historicalModel\.allScorecards/);
  assert.doesNotMatch(`${directory}\n${detail}`, /resolveGuideContentGoogle|refreshHistoricalData|getCourse\(/);
});

test("bare Tournament Guide restores the public long-form page while participant Guide keeps the hub", async () => {
  const [route, detailRoute, appDetailRoute, publicGuide] = await Promise.all([
    source("app/tournament-guide/page.js"),
    source("app/tournament-guide/[section]/page.js"),
    source("app/app/guide/[section]/page.js"),
    source("app/tournament-guide/PublicTournamentGuide.js"),
  ]);
  assert.match(route, /if \(!participantPresentation\)/);
  assert.match(route, /<PublicTournamentGuide content=\{content\} \/>/);
  assert.match(route, /<TournamentGuideHero tournament=\{tournamentIdentity\} courses=\{courses\} \/>/);
  assert.match(route, /className=\{styles\.directory\}/);
  assert.match(publicGuide, /aria-label="Tournament Guide sections"/);
  for (const heading of ["Everything You Need", "Schedule", "Rules &amp; Formats", "Dining", "Local Guide", "Important Contacts"]) {
    assert.match(publicGuide, new RegExp(heading));
  }
  assert.match(publicGuide, /data-guide-source=\{content\.projection\?\.source/);
  assert.doesNotMatch(publicGuide, /loadTournamentGuideSheets|resolveGuideContentGoogle|refreshHistoricalData|Golf Genius|Calcutta/);
  assert.match(detailRoute, /if \(!participantPresentation\)[\s\S]*redirect\(`\/tournament-guide#\$\{section === "getting-around" \? "local-guide" : section\}`\)/);
  assert.match(appDetailRoute, /participantPresentation: true/);
});
