import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament Guide leads with app-first actionable destinations", async () => {
  const page = await source("app/tournament-guide/page.js");
  for (const title of ["Schedule", "Courses", "Rules & Formats", "Dining", "Getting Around", "Important Contacts"]) {
    assert.match(page, new RegExp(`title: "${title.replace(/[&]/g, "&")}"`));
  }
  assert.ok(page.indexOf("<GuideDirectory />") < page.indexOf("className={styles.overview}"));
  assert.match(page, /Quick access to the information golfers use most\./);
});

test("Guide destinations are focused same-origin views using existing workbook content", async () => {
  const [page, detail, route, stats, sheets] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/tournament-guide/GuideDetailPage.js"),
    source("app/tournament-guide/[section]/page.js"), source("lib/stats.js"), source("lib/google-sheets-data.js"),
  ]);
  for (const destination of ["schedule", "rules", "dining", "getting-around", "contacts"]) {
    assert.match(page, new RegExp(`/tournament-guide/${destination}`));
    assert.match(route, new RegExp(`"${destination}"`));
  }
  assert.match(detail, /publicGuideRecords\(sheets\.itinerary, tournament\)/);
  assert.match(detail, /liveData\?\.guide\?\.itinerary\?\.length/);
  assert.match(detail, /publicGuideRecords\(sheets\.rules, tournament\)/);
  assert.match(detail, /getTournamentRules\(tournament\.year\)/);
  assert.match(detail, /getRoundFormats\(\)/);
  assert.match(stats, /historicalData\.rules/);
  assert.match(stats, /historicalData\.rounds/);
  assert.match(sheets, /itinerary: "Tournament Itinerary"/);
  assert.match(sheets, /rules: "Rule Book"/);
  assert.doesNotMatch(detail, /target="_blank"|window\.open|https?:\/\//);
  assert.match(detail, /<Link className=\{styles\.backToGuide\} href="\/tournament-guide">‹ Tournament Guide<\/Link>/);
  assert.doesNotMatch(detail, /Find what you need|className=\{styles\.directory\}/);
});

test("Courses defaults to the active tournament and offers the historical archive", async () => {
  const [courses, normalized] = await Promise.all([source("app/courses/page.js"), source("app/live/sheetData.js")]);
  assert.match(courses, /getTournamentData\(\)/);
  assert.match(courses, /Promise\.allSettled/);
  assert.match(courses, /liveData\?\.guide\?\.courses\?\.length/);
  assert.match(normalized, /guide: \{ itinerary: guideItinerary, courses: guideCourses \}/);
  assert.match(normalized, /publicGuideRecords\(itineraryRows, guideTournament\)/);
  assert.match(courses, /View Course Archive/);
  assert.match(courses, /\/courses\?view=archive/);
  assert.match(courses, /href="\/tournament-guide">‹ Tournament Guide/);
});

test("unfinished Guide content remains placeholder-only without new workbook tabs", async () => {
  const [detail, sheets] = await Promise.all([source("app/tournament-guide/GuideDetailPage.js"), source("lib/google-sheets-data.js")]);
  assert.match(detail, /<Placeholder title="Dining"/);
  assert.match(detail, /<Placeholder title="Getting Around"/);
  assert.match(detail, /<Placeholder title="Important Contacts"/);
  assert.doesNotMatch(sheets, /Dining|Getting Around|Important Contacts/);
});

test("Guide preserves shared app chrome and moves welcome below navigation", async () => {
  const [page, css, schedule, rules] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/tournament-guide/tournament-guide.module.css"),
    source("app/TournamentSchedule.js"), source("app/rules/page.js"),
  ]);
  assert.match(page, /<Header \/>/);
  assert.match(page, /<Footer \/>/);
  assert.match(page, /<p className=\{styles\.eyebrow\}>Welcome<\/p>/);
  assert.match(css, /\.directory/);
  assert.match(css, /padding:18px 0 92px/);
  assert.match(schedule, /\/tournament-guide\/schedule/);
  assert.match(rules, /\/tournament-guide\/rules/);
});
