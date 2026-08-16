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
  assert.match(roundPage, /!useSupabase2026 \? <HistoricalDetailNavigation/);
  assert.match(roundPage, /backLabel=\{`\$\{archive\.year\} Tournament`\}/);
  assert.match(roundNavigation, /center=\{\{ href: backHref, label: backLabel/);
  assert.match(roundNavigation, /left=\{previousHref && previousLabel \? \{/);
  assert.match(roundNavigation, /right=\{nextHref && nextLabel \? \{/);
  assert.doesNotMatch(roundNavigation, /return <span|aria-disabled|disabled/);
  assert.match(roundNavigation, /surface="round"/);
});

test("completed Team History uses one shared parent destination without sibling controls", () => {
  assert.match(teamPage, /!useSupabase2026 \? <HistoryNavigation/);
  assert.match(teamPage, /href: `\/history\/\$\{team\.year\}`/);
  assert.match(teamPage, /label: `\$\{team\.year\} Tournament`/);
  assert.match(teamPage, /direction: "left"/);
  assert.match(teamPage, /surface="team"/);
  const completedNavigation = teamPage.slice(teamPage.indexOf("!useSupabase2026 ? <HistoryNavigation"), teamPage.indexOf("<section className={`${styles.pageHero}"));
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
  const context = coursePage.slice(start, end);
  const tournament = context.indexOf("href: tournamentReturn.href");
  const round = context.indexOf("href: historyReturn.href");
  assert.ok(start >= 0 && tournament >= 0 && tournament < round);
  assert.match(context, /href: tournamentReturn\.href[\s\S]*direction: "left"/);
  assert.match(context, /href: historyReturn\.href[\s\S]*direction: "right"/);
  assert.match(coursePage, /!historyReturn \? <Link href=\{returnLink\.href\}>‹ \{returnLink\.label\}<\/Link>/);
  assert.doesNotMatch(coursePage, /history\.back|router\.back/);
});

test("2026 stays on its existing archive navigation and receives no completed-year Course rail", () => {
  assert.match(yearPage, /useSupabase2026 \? <HistoryArchiveNav/);
  assert.match(roundPage, /useSupabase2026 \? <HistoryArchiveNav/);
  assert.match(teamPage, /useSupabase2026 \? <HistoryArchiveNav/);
  assert.equal(historyCourseTournamentReturn({ source: "history", year: "2026", round: "1" }), null);
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2026", round: "1" }), {
    href: "/history/2026/round/1",
    label: "Back to 2026 Round 1",
  });
  assert.match(coursePage, /historyReturn && !tournamentReturn \? <nav className=\{styles\.historyNavigation\}/);
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
