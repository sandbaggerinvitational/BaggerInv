import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  historyCourseProfileHref,
  historyCourseReturn,
  historyCourseTournamentReturn,
  isCompletedHistoryYear,
} from "../lib/history-course-navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  navigation,
  navigationCss,
  yearPage,
  roundNavigation,
  roundPage,
  teamPage,
  coursePage,
  archive,
  matchCard,
  roundSource,
] = await Promise.all([
  source("app/history/HistoryNavigation.js"),
  source("app/history/history-navigation.module.css"),
  source("app/history/[year]/page.js"),
  source("app/HistoricalDetailNavigation.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("app/courses/[courseId]/page.js"),
  source("lib/historical-data.json").then(JSON.parse),
  source("app/PublicMatchCard.js"),
  source("app/history/[year]/round/[round]/page.js"),
]);

const completedYears = Array.from({ length: 9 }, (_, index) => 2017 + index);

test("completed-year capability matrix uses only existing historical round, team, and course records", () => {
  for (const year of completedYears) {
    const rounds = [...new Set(archive.matches.filter((row) => Number(row.Year) === year).map((row) => Number(row.Round)))];
    const teams = archive.teamNames.filter((row) => Number(row.Year) === year);
    const courses = archive.courses.filter((row) => Number(row.Year) === year);
    assert.deepEqual(rounds, [1, 2, 3], `${year} rounds`);
    assert.equal(teams.length, 2, `${year} teams`);
    assert.equal(courses.length, 3, `${year} courses`);
    assert.equal(courses.every((course) => Boolean(course["Course ID"])), true, `${year} course IDs`);
  }
});

test("shared HistoryNavigation is one semantic primitive with no fake destination placeholders", () => {
  assert.match(navigation, /<nav[\s\S]*aria-label=\{ariaLabel\}/);
  assert.match(navigation, /data-count=\{destinations\.length\}/);
  assert.match(navigation, /<Destination destination=\{left\} position="left" \/>/);
  assert.match(navigation, /<Destination destination=\{center\} position="center" \/>/);
  assert.match(navigation, /<Destination destination=\{right\} position="right" \/>/);
  assert.doesNotMatch(navigation, /disabled|aria-disabled|<span aria-hidden="true" \/>/);
  assert.match(navigation, /ariaLabel = "History navigation"/);
  assert.match(navigation, /aria-label=\{destination\.ariaLabel \|\| destination\.label\}/);
});

test("one-, two-, and three-destination layouts preserve touch, focus, and mobile constraints", () => {
  assert.match(navigationCss, /\.navigation\[data-count="1"\] \{[^}]*grid-template-columns:\s*max-content/);
  assert.match(navigationCss, /\.navigation\[data-count="2"\] \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(navigationCss, /\.navigation\[data-count="3"\] \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(navigationCss, /\.destination \{[^}]*min-width:\s*0;[^}]*min-height:\s*44px/);
  assert.match(navigationCss, /\.destination:focus-visible/);
  assert.match(navigationCss, /@media \(max-width: 430px\)/);
  assert.match(navigationCss, /@media \(max-width: 350px\)/);
});

test("2017–2025 year pages share one top rail and never render bottom duplication", () => {
  const hero = yearPage.indexOf("<section className={`${styles.tournamentHero}");
  const rail = yearPage.indexOf('surface="year"');
  const content = yearPage.indexOf("<section className={styles.content}>");
  assert.ok(hero >= 0 && hero < rail && rail < content);
  assert.equal((yearPage.match(/surface="year"/g) || []).length, 1);
  assert.match(yearPage, /left=\{previousYear \? \{/);
  assert.match(yearPage, /center=\{\{[\s\S]*href: "\/history"[\s\S]*label: "All Tournament Years"/);
  assert.match(yearPage, /right=\{nextYear \? \{/);
  assert.doesNotMatch(yearPage, /tournamentYearNavigationBottom/);
  assert.doesNotMatch(yearPage, /disabled|aria-disabled/);
});

test("first and middle year destinations are canonical and 2017 has no fabricated predecessor", () => {
  assert.equal(isCompletedHistoryYear(2017), true);
  assert.equal(isCompletedHistoryYear(2025), true);
  assert.equal(isCompletedHistoryYear(2016), false);
  assert.equal(isCompletedHistoryYear(2026), false);
  const years = archive.tournaments.map((row) => Number(row.Year)).sort((a, b) => a - b);
  assert.deepEqual(years.slice(0, 10), [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.doesNotMatch(yearPage, /2016/);
});

test("completed Round History adapts Previous, Tournament, and Next without empty controls", () => {
  assert.match(roundPage, /<HistoricalDetailNavigation/);
  assert.match(roundPage, /backLabel="Tournament"/);
  assert.match(roundPage, /backDetail=\{String\(archive\.year\)\}/);
  assert.match(roundPage, /backAriaLabel=\{`\$\{archive\.year\} Tournament`\}/);
  assert.match(roundPage, /completedYear=\{Number\(archive\.year\) >= 2017 && Number\(archive\.year\) <= 2026\}/);
  assert.match(roundNavigation, /const tournamentDestination = \{[\s\S]*label: backLabel,[\s\S]*detail: backDetail,[\s\S]*ariaLabel: backAriaLabel \|\| backLabel/);
  assert.match(roundNavigation, /const previousDestination = previousHref && previousLabel \? \{/);
  assert.match(roundNavigation, /const nextDestination = nextHref && nextLabel \? \{/);
  assert.doesNotMatch(roundNavigation, /return <span|aria-disabled|disabled/);
  assert.match(roundNavigation, /surface="round"/);
});

test("completed Round History distributes first, middle, and final destinations without empty tracks", () => {
  assert.match(roundNavigation, /completedYear = false/);
  assert.match(roundNavigation, /const firstRound = completedYear && !previousDestination && nextDestination/);
  assert.match(roundNavigation, /const finalRound = completedYear && previousDestination && !nextDestination/);
  assert.match(roundNavigation, /center=\{!completedYear \|\| \(!firstRound && !finalRound\)[\s\S]*\? tournamentDestination[\s\S]*: null\}/);
  assert.match(roundNavigation, /left=\{firstRound[\s\S]*\{ \.\.\.tournamentDestination, direction: "left" \}[\s\S]*: previousDestination\}/);
  assert.match(roundNavigation, /right=\{finalRound[\s\S]*\{ \.\.\.tournamentDestination, direction: "none" \}[\s\S]*: nextDestination\}/);
  assert.match(navigationCss, /\.navigation\[data-count="2"\] \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("completed Team History uses one shared parent destination without sibling controls", () => {
  assert.match(teamPage, /<HistoryNavigation/);
  assert.match(teamPage, /href: `\/history\/\$\{team\.year\}`/);
  assert.match(teamPage, /label: "Tournament"/);
  assert.match(teamPage, /detail: String\(team\.year\)/);
  assert.match(teamPage, /ariaLabel: `\$\{team\.year\} Tournament`/);
  assert.match(teamPage, /direction: "left"/);
  assert.match(teamPage, /surface="team"/);
  const hero = teamPage.indexOf("<section className={`${styles.pageHero}");
  const navigation = teamPage.indexOf("<HistoryNavigation");
  const content = teamPage.indexOf("<section className={`${styles.content}", navigation);
  assert.ok(hero >= 0 && hero < navigation && navigation < content);
  const completedNavigation = teamPage.slice(navigation, content);
  assert.doesNotMatch(completedNavigation, /right=|center=|Previous Team|Next Team/);
});

test("every canonical completed-year course link preserves archive and explicit History context", () => {
  for (const course of archive.courses.filter((row) => completedYears.includes(Number(row.Year)))) {
    const round = Number(String(course.Round).replace(/\D/g, ""));
    const href = historyCourseProfileHref({ courseId: course["Course ID"], year: course.Year, round });
    assert.equal(href, `/courses/${encodeURIComponent(course["Course ID"])}?view=archive&source=history&year=${course.Year}&round=${round}`);
    assert.deepEqual(historyCourseReturn({ source: "history", year: String(course.Year), round: String(round) }), {
      href: `/history/${course.Year}/round/${round}`,
      label: `Back to ${course.Year} Round ${round}`,
    });
    assert.deepEqual(historyCourseTournamentReturn({ source: "history", year: String(course.Year), round: String(round) }), {
      href: `/history/${course.Year}`,
      label: `${course.Year} Tournament`,
    });
  }
  assert.match(yearPage, /historyCourseProfileHref\(\{ courseId: course\["Course ID"\], year: tournament\.year, round \}\)/);
});

test("History-context Course navigation orders Tournament left and source Round right", () => {
  const start = coursePage.indexOf("{tournamentReturn ? <HistoryNavigation");
  const end = coursePage.indexOf('surface="course"', start);
  const hero = coursePage.indexOf("<section className={styles.hero}");
  const content = coursePage.indexOf("<div className={styles.shell}", end);
  const context = coursePage.slice(start, end);
  const tournament = context.indexOf("href: tournamentReturn.href");
  const round = context.indexOf("href: historyReturn.href");
  assert.ok(hero >= 0 && hero < start && start < content);
  assert.ok(tournament >= 0 && tournament < round);
  assert.match(context, /href: tournamentReturn\.href[\s\S]*label: "Tournament"[\s\S]*detail: String\(resolvedSearchParams\.year\)[\s\S]*direction: "left"/);
  assert.match(context, /href: historyReturn\.href[\s\S]*label: "Round"[\s\S]*detail: `Round \$\{Number\(resolvedSearchParams\.round\)\}`[\s\S]*direction: "right"/);
  assert.match(coursePage, /!historyReturn \? <Link href=\{returnLink\.href\}>‹ \{returnLink\.label\}<\/Link>/);
  assert.doesNotMatch(coursePage, /history\.back|router\.back/);
});

test("all completed navigation variants use the Year rail descriptor and serif destination grammar", () => {
  assert.match(navigation, /destination\.detail \? \([\s\S]*<span>[\s\S]*\{destination\.label\}[\s\S]*<strong>\{destination\.detail\}<\/strong>/);
  assert.match(navigationCss, /\.destination span[\s\S]*font-family:\s*var\(--history-nav-sans\)/);
  assert.match(navigationCss, /\.destination strong \{[^}]*font-family:\s*var\(--history-nav-display\)/);
  assert.match(roundPage, /backLabel="Tournament"[\s\S]*backDetail=\{String\(archive\.year\)\}/);
  assert.match(teamPage, /label: "Tournament",[\s\S]*detail: String\(team\.year\)/);
  assert.match(coursePage, /label: "Tournament",[\s\S]*detail: String\(resolvedSearchParams\.year\)[\s\S]*label: "Round",[\s\S]*detail: `Round \$\{Number\(resolvedSearchParams\.round\)\}`/);
});

test("all HistoryNavigation destination values keep the approved dark-green token in every interaction state", () => {
  assert.match(navigationCss, /\.destination \{[^}]*color:\s*var\(--tsi-green-900,\s*#0b3529\)/);
  assert.match(
    navigationCss,
    /\.destination:visited,\s*\.destination:hover,\s*\.destination:active,\s*\.destination:focus-visible\s*\{[^}]*color:\s*var\(--tsi-green-900,\s*#0b3529\)/,
  );
  assert.match(navigationCss, /\.destination span \{[^}]*color:\s*var\(--tsi-muted,\s*#687069\)/);
  assert.match(navigationCss, /\.destination strong \{[^}]*color:\s*inherit/);
  assert.match(navigationCss, /\.destination b \{[^}]*color:\s*inherit/);
  assert.doesNotMatch(navigationCss, /\.destination:(?:visited|hover|active|focus-visible)[\s\S]{0,160}color:\s*var\(--tsi-gold/);
});

test("2026 now opts into the shared navigation without changing completed-year capability rules", () => {
  for (const page of [yearPage, roundPage, teamPage]) assert.doesNotMatch(page, /<HistoryArchiveNav/);
  assert.deepEqual(historyCourseTournamentReturn({ source: "history", year: "2026", round: "1" }), {
    href: "/history/2026",
    label: "2026 Tournament",
  });
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2026", round: "1" }), {
    href: "/history/2026/round/1",
    label: "Back to 2026 Round 1",
  });
  assert.equal(historyCourseProfileHref({ courseId: "TPGC01", year: "2026", round: "1" }),
    "/courses/TPGC01?source=history&year=2026&round=1");
  assert.match(coursePage, /tournamentReturn \? <HistoryNavigation/);
});

test("Step 3A.5 player-slot and Birdie Leader corrections remain frozen", () => {
  assert.match(matchCard, /historicalPairingPlayerRows\(teamOnePlayers, teamTwoPlayers\)/);
  assert.match(matchCard, /data-empty=\{empty \? "true" : undefined\}/);
  assert.match(roundSource, /\.\.\.\(!completed2025 \? \[\{ label: "Most Birdies"/);
  assert.match(roundSource, /\{ label: "Birdie Leader"/);
});

test("navigation introduces no requests, endpoints, caches, or dependencies", () => {
  for (const content of [navigation, roundNavigation]) {
    assert.doesNotMatch(content, /fetch\(|axios|supabase|\/api\/|useEffect|useState|router\./i);
  }
  assert.doesNotMatch(coursePage, /history\.back|router\.back/);
});
