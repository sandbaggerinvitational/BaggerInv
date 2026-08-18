import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { historyTournamentCardResult } from "../lib/history-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [archivePage, archiveCss, historicalData, yearPage, championsPage, liveMatchCenter] = await Promise.all([
  source("app/history/page.js"),
  source("app/historical.module.css"),
  source("lib/historical-data.json").then(JSON.parse),
  source("app/history/[year]/page.js"),
  source("app/champions/page.js"),
  source("app/live/MatchCenter.js"),
]);

const completedYears = Array.from({ length: 9 }, (_, index) => 2017 + index);

test("2017–2025 Archive cards use the canonical Tournament History destination", () => {
  const archiveYears = historicalData.tournaments
    .map((row) => Number(row.Year))
    .filter((year) => completedYears.includes(year))
    .sort((a, b) => a - b);

  assert.deepEqual(archiveYears, completedYears);
  assert.match(archivePage, /href=\{`\/history\/\$\{tournament\.year\}`\}/);
  assert.match(archivePage, /`View \$\{tournament\.year\} Tournament History`/);
  assert.doesNotMatch(archivePage, /from=player|player=/);
});

test("Archive champion facts remain visible without a separate Champion action", () => {
  assert.match(archivePage, /<strong>\{historyTournamentCardResult\(tournament\)\}<\/strong>/);
  assert.match(archivePage, /const completed = Boolean\(tournament\.championTeamId\)/);
  assert.doesNotMatch(archivePage, /\/champions\/\$\{tournament\.year\}/);
  assert.doesNotMatch(archivePage, /View \{tournament\.year\} Champion/);
  assert.doesNotMatch(archivePage, /historyChampionLink/);
  assert.doesNotMatch(archiveCss, /\.historyChampionLink/);
});

test("the full Archive card link has semantic focus treatment without nested links", () => {
  assert.match(archivePage, /<article className=\{styles\.historyPhotoCard\}[\s\S]*?<Link[\s\S]*?className=\{styles\.historyCardPrimary\}/);
  assert.equal((archivePage.match(/<Link/g) || []).length, 1);
  assert.match(archiveCss, /\.historyPhotoCard:focus-within/);
  assert.match(archiveCss, /\.historyCardPrimary:focus-visible/);
  assert.match(archiveCss, /outline: 3px solid var\(--tsi-gold-500\)/);
});

test("2026 preserves its current in-progress Archive behavior", () => {
  assert.equal(historyTournamentCardResult({ year: 2026 }), "Tournament in progress");
  assert.match(archivePage, /href=\{`\/history\/\$\{tournament\.year\}`\}/);
  assert.match(archivePage, /historyTournamentCardResult\(tournament\)/);
  assert.doesNotMatch(archivePage, /View 2026 Champion/);
});

test("normal Archive entry and explicit Player-origin History remain distinct", () => {
  assert.doesNotMatch(archivePage, /withPlayerOriginContext|from=player|player=/);
  assert.match(yearPage, /<PlayerProfileReturnNavigation context=\{playerReturnContext\} \/>/);
  assert.match(yearPage, /href: "\/history"[\s\S]*label: "All Tournament Years"/);
});

test("the existing Champions product remains available outside the Archive", () => {
  assert.match(championsPage, /href=\{`\/champions\/\$\{tournament\.year\}`\}/);
  assert.match(liveMatchCenter, /href=\{`\/champions\/\$\{tournament\.year\}`\}/);
});
