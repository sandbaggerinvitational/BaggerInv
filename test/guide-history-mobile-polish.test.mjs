import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Guide mobile directory preserves its six canonical destinations without repeated detail heroes", async () => {
  const [landing, detail, courses, icon, css] = await Promise.all([
    source("app/tournament-guide/page.js"),
    source("app/tournament-guide/GuideDetailPage.js"),
    source("app/courses/page.js"),
    source("app/tournament-guide/GuideDirectoryIcon.js"),
    source("app/tournament-guide/tournament-guide.module.css"),
  ]);
  for (const destination of ["Schedule", "Courses", "Rules & Formats", "Dining", "Local Guide", "Important Contacts"]) {
    assert.match(landing, new RegExp(`title: "${destination.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`));
  }
  assert.match(landing, /GuideDirectoryIcon/);
  assert.match(icon, /<svg/);
  assert.doesNotMatch(detail, /TournamentGuideHero/);
  assert.doesNotMatch(courses, /TournamentGuideHero/);
  assert.match(detail, /‹ Tournament Guide/);
  assert.match(css, /min-height:64px/);
  assert.match(css, /min-height:44px/);
});

test("Guide and nested course references use the explicit participant namespace", async () => {
  const shell = await source("lib/participant-shell.js");
  assert.match(shell, /\/app\/courses/);
  assert.match(shell, /return "Course Hole"/);
  assert.match(shell, /if \(route === "\/app\/guide"\) return "Tournament Guide"/);
  const destination = shell.slice(0, shell.indexOf("export function participantNavigationRoute"));
  assert.doesNotMatch(destination, /Tournament Guide/);
});

test("2026 History uses the shared route-backed navigation and keeps older-year presentation isolated", async () => {
  const [nav, year, round, team] = await Promise.all([
    source("app/history/HistoryNavigation.js"),
    source("app/history/[year]/page.js"),
    source("app/history/[year]/round/[round]/page.js"),
    source("app/history/[year]/team/[side]/page.js"),
  ]);
  assert.match(nav, /<nav[\s\S]*aria-label=\{ariaLabel\}/);
  assert.match(nav, /data-count=\{destinations\.length\}/);
  for (const page of [year, round, team]) assert.doesNotMatch(page, /<HistoryArchiveNav/);
  assert.match(year, /2026 tournament record/);
  assert.doesNotMatch(year, /Final Recap/);
  assert.match(round, /useSupabase2026[\s\S]*HistoricalMatchRow[\s\S]*PublicMatchCard/);
  assert.match(team, /useSupabase2026[\s\S]*teamRoundSummary[\s\S]*View Round/);
  assert.doesNotMatch(team, /HistoricalMatchRow/);
});

test("Historical mobile rows expose official scorecards only for finalized matches", async () => {
  const [row, scorecard, scorecardCss] = await Promise.all([
    source("app/history/HistoricalMatchRow.js"),
    source("app/ScorecardTable.js"),
    source("app/scorecard.module.css"),
  ]);
  assert.match(row, /state === "final" \? <ScorecardTable/);
  assert.doesNotMatch(row, /state === "live"[^\n]*ScorecardTable/);
  assert.match(row, /Official result/);
  assert.match(row, /Current match/);
  assert.match(scorecard, /showSummary = false/);
  assert.match(scorecard, /scorecard\.total/);
  assert.match(scorecard, /scorecard\.strokesReceived/);
  assert.match(scorecard, /scorecard\.netTotals\?\.total/);
  assert.match(scorecard, /const start = segment === "back" \? 10 : 1/);
  assert.match(scorecard, /const end = segment === "front" \? 9 : 18/);
  assert.match(scorecardCss, /position:\s*sticky/);
});

test("History presentation components add no participant data request or analytics authority", async () => {
  const presentation = await Promise.all([
    source("app/history/HistoricalMatchRow.js"),
    source("app/history/HistoryArchiveNav.js"),
  ]);
  const pages = await Promise.all([
    source("app/history/[year]/page.js"),
    source("app/history/[year]/round/[round]/page.js"),
    source("app/history/[year]/team/[side]/page.js"),
  ]);
  const combined = presentation.join("\n");
  assert.doesNotMatch(combined, /fetch\(|google|gviz|\/api\/live/i);
  assert.doesNotMatch(combined, /buildScorecardAnalytics\(/);
  for (const page of pages) {
    assert.match(page, /loadHistory2026View/);
    assert.match(page, /isSupabaseHistory2026/);
  }
});
