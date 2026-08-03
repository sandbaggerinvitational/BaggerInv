import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament Guide leads with app-first actionable destinations", async () => {
  const page = await source("app/tournament-guide/page.js");
  for (const title of ["Schedule", "Courses", "Rules & Formats", "Match Formats", "Dining", "Travel", "Important Contacts"]) {
    assert.match(page, new RegExp(`title: "${title.replace(/[&]/g, "&")}"`));
  }
  assert.ok(page.indexOf("<GuideDirectory />") < page.indexOf("className={styles.overview}"));
  assert.match(page, /Quick access to the information golfers use most\./);
});

test("Guide destinations are focused same-origin views using published content", async () => {
  const page = await source("app/tournament-guide/page.js");
  for (const section of ["schedule", "rules", "match-formats", "dining", "travel", "contacts"]) {
    assert.match(page, new RegExp(`section === "${section}"`));
  }
  assert.match(page, /publicGuideRecords\(sheets\.itinerary, tournament\)/);
  assert.match(page, /publicGuideRecords\(sheets\.rules, tournament\)/);
  assert.match(page, /publicGuideRecords\(sheets\.information, tournament\)/);
  assert.doesNotMatch(page, /target="_blank"|window\.open|https?:\/\//);
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
  assert.match(schedule, /\/tournament-guide\?section=schedule/);
  assert.match(rules, /\/tournament-guide\?section=rules/);
});
