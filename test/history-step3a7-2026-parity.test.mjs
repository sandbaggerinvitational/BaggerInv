import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildHistory2026Adapter, history2026TeamPageModel } from "../lib/history-2026-adapter.js";
import {
  historyCourseProfileHref,
  historyCourseReturn,
  historyCourseTournamentReturn,
} from "../lib/history-course-navigation.js";
import { makeGuideProjection, makeHistory2026Aggregate } from "./fixtures/history-2026.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  yearPage,
  roundPage,
  teamPage,
  coursePage,
  detailNavigation,
  navigation,
  navigationCss,
  service,
] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("app/courses/[courseId]/page.js"),
  source("app/HistoricalDetailNavigation.js"),
  source("app/history/HistoryNavigation.js"),
  source("app/history/history-navigation.module.css"),
  source("lib/history-2026-service.js"),
]);

const view = buildHistory2026Adapter(makeHistory2026Aggregate(), {
  guideProjection: makeGuideProjection(),
});

test("canonical 2026 History supports all three lifecycle-aware Round models", () => {
  assert.equal(view.source, "supabase");
  assert.equal(view.year, 2026);
  assert.equal(view.matches.length, 24);
  assert.deepEqual(view.rounds.map((round) => ({
    round: round.round,
    format: round.format,
    course: round.course.Course,
    final: round.matches.filter((match) => match.status === "FINAL").length,
    live: round.matches.filter((match) => match.status === "LIVE").length,
    scorecards: view.analytics.scorecards.filter((scorecard) => scorecard.round === round.round).length,
  })), [
    { round: 1, format: "BB", course: "Turtle Point", final: 6, live: 0, scorecards: 24 },
    { round: 2, format: "SC", course: "Cougar Point", final: 6, live: 0, scorecards: 12 },
    { round: 3, format: "SI", course: "The Ocean Course", final: 5, live: 7, scorecards: 10 },
  ]);
  for (const round of [1, 2, 3]) assert.equal(view.rounds.find((entry) => entry.round === round)?.round, round);
  assert.equal(view.rounds.find((entry) => entry.round === 4) || null, null);
  assert.match(service, /export function history2026RoundPageModel/);
  assert.match(service, /const selected = rows\.find\(\(item\) => number\([\s\S]*item\?\.archive\?\.round \?\? item\?\.round[\s\S]*=== target\)/);
  assert.match(service, /return selected \? \{[\s\S]*archive: selected\.archive \|\| selected[\s\S]*\} : null/);
});

test("Round route fixes the null legacy-coverage render boundary without hiding genuine failures", () => {
  assert.match(roundPage, /const legacyRoundStatisticItems = useSupabase2026 \? roundStatisticItems : \[/);
  assert.match(roundPage, /legacyScorecardCoverage\?\.completeMatchScorecards/);
  assert.match(roundPage, /loadHistory2026View\(\{ year: Number\(year\) \}\)/);
  assert.match(roundPage, /history2026RoundPageModel/);
  assert.match(roundPage, /HistoryUnavailablePage/);
  assert.match(roundPage, /if \(!archive\) notFound\(\)/);
  assert.doesNotMatch(roundPage, /2025.*fallback|history\.back|\/api\/live|gviz/i);
});

test("all 2026 overview Round actions use the canonical neutral History route", () => {
  assert.match(yearPage, /href=\{`\/history\/\$\{tournament\.year\}\/round\/\$\{round\}`\}/);
  assert.match(yearPage, />View Round <i aria-hidden="true">→<\/i><\/em>/);
  assert.doesNotMatch(yearPage, />View Results/);
});

test("2026 Year navigation is shared, top-placed, two-destination, and has no fabricated 2027", () => {
  const hero = yearPage.indexOf("<section className={`${styles.tournamentHero}");
  const rail = yearPage.indexOf("<HistoryNavigation", hero);
  const content = yearPage.indexOf("<section className={styles.content}>", rail);
  assert.ok(hero >= 0 && hero < rail && rail < content);
  assert.match(yearPage, /center=\{\{[\s\S]*href: "\/history"[\s\S]*label: "All Tournament Years"/);
  assert.match(yearPage, /left=\{previousYear \? \{/);
  assert.match(yearPage, /right=\{nextYear \? \{/);
  assert.doesNotMatch(yearPage, /<HistoryArchiveNav|2027|tournamentYearNavigationBottom/);
  assert.equal(view.previousYear, 2025);
  assert.equal(view.nextYear, null);
});

test("the redundant Archive, Overview, Round, and Team pseudo-tab rail is removed from 2026 pages", () => {
  for (const page of [yearPage, roundPage, teamPage]) {
    assert.doesNotMatch(page, /<HistoryArchiveNav/);
  }
  assert.match(yearPage, /href=\{`\/history\/\$\{tournament\.year\}\/round\/\$\{round\}`\}/);
  assert.match(yearPage, /href=\{`\/history\/\$\{tournament\.year\}\/team\/\$\{encodeURIComponent\(team\.side\)\}`\}/);
});

test("2026 first, middle, and final Round navigation uses the approved adaptive layout", () => {
  assert.match(roundPage, /<HistoricalDetailNavigation/);
  assert.match(roundPage, /completedYear=\{Number\(archive\.year\) >= 2017 && Number\(archive\.year\) <= 2026\}/);
  assert.match(roundPage, /backLabel="Tournament"/);
  assert.match(roundPage, /backDetail=\{String\(archive\.year\)\}/);
  assert.match(detailNavigation, /const firstRound = completedYear && !previousDestination && nextDestination/);
  assert.match(detailNavigation, /const finalRound = completedYear && previousDestination && !nextDestination/);
  assert.match(detailNavigation, /left=\{firstRound[\s\S]*tournamentDestination, direction: "left"/);
  assert.match(detailNavigation, /right=\{finalRound[\s\S]*tournamentDestination, direction: "none"/);
  assert.doesNotMatch(detailNavigation, /disabled|aria-disabled/);
});

test("Round destination typography and interaction states retain approved dark-green parity", () => {
  assert.match(navigation, /<nav[\s\S]*data-count=\{destinations\.length\}/);
  assert.match(navigationCss, /\.destination \{[^}]*color:\s*var\(--tsi-green-900,\s*#0b3529\)/);
  assert.match(navigationCss, /\.destination:visited,[\s\S]*\.destination:focus-visible\s*\{[^}]*color:\s*var\(--tsi-green-900,\s*#0b3529\)/);
  assert.match(navigationCss, /\.destination span \{[^}]*color:\s*var\(--tsi-muted,\s*#687069\)/);
  assert.doesNotMatch(navigationCss, /\.destination:(?:visited|hover|active|focus-visible)[\s\S]{0,160}color:\s*var\(--tsi-gold/);
});

test("both 2026 Team pages place one Tournament parent rail below the hero", () => {
  const hero = teamPage.indexOf("<section className={`${styles.pageHero}");
  const rail = teamPage.indexOf("<HistoryNavigation", hero);
  const content = teamPage.indexOf("<section className={`${styles.content}", rail);
  assert.ok(hero >= 0 && hero < rail && rail < content);
  assert.match(teamPage, /href: `\/history\/\$\{team\.year\}`/);
  assert.match(teamPage, /label: "Tournament"[\s\S]*detail: String\(team\.year\)[\s\S]*direction: "left"/);
  for (const side of ["PICKLES", "LIPPIT"]) {
    const model = history2026TeamPageModel(view, side);
    assert.ok(model);
    assert.equal(model.roster.length, 12);
    assert.equal(model.roundGroups.length, 3);
  }
});

test("2026 Course links preserve explicit History context and canonical Course ownership", () => {
  const cases = [
    ["TPGC01", 1],
    ["CPGC01", 2],
    ["OCGC01", 3],
  ];
  for (const [courseId, round] of cases) {
    assert.equal(historyCourseProfileHref({ courseId, year: 2026, round }),
      `/courses/${courseId}?source=history&year=2026&round=${round}`);
    assert.deepEqual(historyCourseReturn({ source: "history", year: "2026", round: String(round) }), {
      href: `/history/2026/round/${round}`,
      label: `Back to 2026 Round ${round}`,
    });
    assert.deepEqual(historyCourseTournamentReturn({ source: "history", year: "2026", round: String(round) }), {
      href: "/history/2026",
      label: "2026 Tournament",
    });
  }
  assert.doesNotMatch(historyCourseProfileHref({ courseId: "TPGC01", year: 2026, round: 1 }), /view=archive/);
});

test("History-context Course navigation sits below the hero while direct and Guide entry stay normal", () => {
  const hero = coursePage.indexOf("<section className={styles.hero}");
  const rail = coursePage.indexOf("{tournamentReturn ? <HistoryNavigation", hero);
  const content = coursePage.indexOf("<div className={styles.shell}", rail);
  assert.ok(hero >= 0 && hero < rail && rail < content);
  assert.match(coursePage, /left=\{\{[\s\S]*href: tournamentReturn\.href[\s\S]*direction: "left"/);
  assert.match(coursePage, /right=\{historyReturn[\s\S]*href: historyReturn\.href[\s\S]*direction: "right"/);
  assert.match(coursePage, /!historyReturn \? <Link href=\{returnLink\.href\}>‹ \{returnLink\.label\}<\/Link>/);
  assert.deepEqual(historyCourseReturn({}), null);
  assert.deepEqual(historyCourseTournamentReturn({}), null);
  assert.doesNotMatch(coursePage, /history\.back|router\.back/);
});

test("full current standings disclose inline from the existing 24-row History payload", () => {
  assert.equal(view.leaderboardRows.length, 24);
  assert.match(yearPage, /<details[\s\S]*data-current-standings-disclosure/);
  assert.match(yearPage, /View Full Standings/);
  assert.match(yearPage, /Show Top 5/);
  assert.match(yearPage, /leaderboard\.map\(\(row\) => renderStanding\(row, "full"\)\)/);
  assert.match(yearPage, /prefetch=\{keyPrefix === "full" \? false : undefined\}/);
  assert.doesNotMatch(yearPage, /View Full Leaderboard|\/live\?view=leaderboards|router\.push|useState|fetch\(/);
});

test("2026 remains explicitly in progress without completed-year claims", () => {
  assert.equal(view.tournament.lifecycle, "IN_PROGRESS");
  assert.match(yearPage, /"In progress"/);
  assert.match(yearPage, /Final results and scorecards appear here as matches become official/);
  const currentOverview = yearPage.slice(yearPage.indexOf("function CurrentHistoryOverview"), yearPage.indexOf("export default async function"));
  assert.doesNotMatch(currentOverview, /Final Player Standings|Champions|Runner-up/);
  assert.match(currentOverview, /Not awarded/);
});

test("navigation and standings changes add no request, endpoint, cache, dependency, or browser-history authority", () => {
  for (const page of [yearPage, roundPage, teamPage, coursePage, detailNavigation, navigation]) {
    assert.doesNotMatch(page, /fetch\(|axios|\/api\/live|gviz|history\.back|router\.back/i);
  }
  assert.doesNotMatch(service, /google-sheets-data|historical-data\.json|loadScorecardSheets|refreshHistoricalData/);
});

test("shared History navigation remains semantic, focusable, and responsive for one/two/three links", () => {
  assert.match(navigation, /<nav[\s\S]*aria-label=\{ariaLabel\}/);
  assert.match(navigation, /aria-label=\{destination\.ariaLabel \|\| destination\.label\}/);
  assert.match(navigationCss, /\.navigation\[data-count="1"\]/);
  assert.match(navigationCss, /\.navigation\[data-count="2"\]/);
  assert.match(navigationCss, /\.navigation\[data-count="3"\]/);
  assert.match(navigationCss, /min-height:\s*44px/);
  assert.match(navigationCss, /\.destination:focus-visible/);
  assert.match(navigationCss, /@media \(max-width: 430px\)/);
  assert.match(navigationCss, /@media \(max-width: 350px\)/);
});
