import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const publicReturn = (page) => {
  const start = page.indexOf("  if (!participantPresentation) {");
  const renderedReturn = page.indexOf("\n    return (\n", start + 1);
  const end = page.indexOf("\n  return (\n", start + 1);
  assert.ok(start >= 0 && renderedReturn > start && end > renderedReturn, "expected a bounded public presentation return");
  return page.slice(start, end);
};

const [
  archivePage,
  yearPage,
  roundPage,
  teamPage,
  publicNavigation,
  publicCss,
  appArchive,
  appYear,
  appRound,
  appTeam,
] = await Promise.all([
  source("app/history/page.js"),
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("app/history/PublicHistoricalDetailNavigation.js"),
  source("app/history/public-history.module.css"),
  source("app/app/history/page.js"),
  source("app/app/history/[year]/page.js"),
  source("app/app/history/[year]/round/[round]/page.js"),
  source("app/app/history/[year]/team/[side]/page.js"),
]);

test("public History restores the website hero grid and completed-year Champions actions", () => {
  assert.match(archivePage, /participantPresentation \? pwaStyles\.archiveHero : ""/);
  assert.match(archivePage, /participantPresentation \? pwaStyles\.archiveContent : ""/);
  assert.match(archivePage, /participantPresentation \? pwaStyles\.yearGrid : ""/);
  assert.match(archivePage, /!participantPresentation && completed[\s\S]*href=\{`\/champions\/\$\{tournament\.year\}`\}[\s\S]*View \{tournament\.year\} Champion/);
  assert.match(archivePage, /alt=\{participantPresentation \? "" : `\$\{tournament\.year\} \$\{tournament\.Destination\}`\}/);
});

test("public year History restores both baseline year rails and desktop overview sections", () => {
  const publicYear = publicReturn(yearPage);
  assert.match(publicYear, /<Header \/>/);
  assert.equal((publicYear.match(/<PublicYearNavigation/g) || []).length, 2);
  assert.match(publicYear, /<PublicYearOverview/);
  for (const copy of ["Official Team Selection", "The Teams", "Courses Played", "Player Standings", "Available Scorecard History", "Tournament Honors"]) {
    assert.match(yearPage, new RegExp(copy));
  }
  assert.match(yearPage, /isSupabaseDraftRead\(env\)[\s\S]*getDraftByYear\(year, \{ env \}\)\.catch\(\(\) => null\)/);
  assert.match(yearPage, /formatHistoryTournamentHandicap\(team\.averageHandicap\)/);
  assert.match(yearPage, /function publicTournamentStatus[\s\S]*"IN_PROGRESS"[\s\S]*label: "In Progress"/);
  assert.match(publicYear, /status=\{publicTournamentStatus\(tournament, status\)\}/);
  assert.match(publicYear, /<Footer \/>/);
});

test("public round History restores baseline detail rails, match cards, scorecards, and visible stats", () => {
  const publicRound = publicReturn(roundPage);
  assert.equal((publicRound.match(/\{publicNavigation\(/g) || []).length, 2);
  assert.match(publicRound, /<PublicHistoricalDetailNavigation/);
  assert.match(publicRound, /<PublicMatchCard[\s\S]*participantPresentation=\{false\}/);
  assert.match(publicRound, /scorecards=\{publicMatchScorecards\(match\.id\)\}/);
  assert.match(publicRound, /<ScoringStatGrid items=\{legacyRoundStatisticItems\} \/>/);
  assert.match(publicRound, /<Header \/>[\s\S]*<Footer \/>/);
  assert.match(publicNavigation, /Previous Round[\s\S]*Next Round/);
  assert.match(publicCss, /\.detailNavigationTop[\s\S]*border-bottom: 1px solid var\(--tsi-line\)/);
});

test("public team History restores the website back link, hero, and roster without the PWA rail", () => {
  const publicTeam = publicReturn(teamPage);
  assert.match(publicTeam, /<ContextBackLink[\s\S]*Back to \$\{team\.year\} Tournament/);
  assert.match(publicTeam, /className=\{`\$\{styles\.pageHero\} \$\{styles\.teamRosterHero\}`\}/);
  assert.match(publicTeam, /styles\.rosterGrid[\s\S]*styles\.rosterCard/);
  assert.match(publicTeam, /formatHistoryTournamentHandicap\(handicap\)/);
  assert.doesNotMatch(publicTeam, /<HistoryNavigation|<HistoryBackToTop|pwaStyles/);
  assert.match(publicTeam, /<Header \/>[\s\S]*<Footer \/>/);
});

test("explicit participant routes retain the existing PWA presentation path", () => {
  for (const wrapper of [appArchive, appYear, appRound, appTeam]) {
    assert.match(wrapper, /participantPresentation: true/);
  }
  const participantYear = yearPage.slice(publicReturn(yearPage).length + yearPage.indexOf("  if (!participantPresentation) {"));
  const participantRound = roundPage.slice(publicReturn(roundPage).length + roundPage.indexOf("  if (!participantPresentation) {"));
  const participantTeam = teamPage.slice(publicReturn(teamPage).length + teamPage.indexOf("  if (!participantPresentation) {"));
  assert.match(participantYear, /<HistoryNavigation/);
  assert.match(participantYear, /<CompletedYearOverview|<CurrentHistoryOverview/);
  assert.match(participantRound, /<HistoricalDetailNavigation/);
  assert.match(participantRound, /<HistoricalMatchRow/);
  assert.match(participantRound, /<HistoryBackToTop \/>/);
  assert.match(participantTeam, /<HistoryNavigation/);
  assert.match(participantTeam, /<HistoryBackToTop \/>/);
});

test("History restoration keeps current Supabase readers and introduces no Google request path", () => {
  for (const page of [archivePage, yearPage, roundPage, teamPage]) {
    assert.match(page, /applicationPageEnvironment/);
    assert.doesNotMatch(page, /fetch\(|gviz|googleapis|sheets\.google/i);
  }
  assert.match(archivePage, /loadCompletedHistoryYears\(\{ env \}\)/);
  assert.match(archivePage, /loadHistory2026View\(\{ year: 2026, env \}\)/);
  assert.match(yearPage, /loadCompletedHistoryView\(\{ year: Number\(year\), env \}\)/);
  assert.match(yearPage, /loadHistory2026View\(\{ year: Number\(year\), env \}\)/);
  assert.match(roundPage, /loadCompletedHistoryView\(\{ year: Number\(year\), env \}\)/);
  assert.match(teamPage, /loadCompletedHistoryView\(\{ year: Number\(year\), env \}\)/);
});
