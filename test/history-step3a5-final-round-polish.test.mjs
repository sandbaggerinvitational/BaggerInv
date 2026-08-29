import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  historicalPairingPlayerRows,
  historicalStrokeText,
} from "../lib/history-match-presentation.js";
import {
  historyCourseReturn,
  historyCourseTournamentReturn,
} from "../lib/history-course-navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [matchCard, matchCss, roundPage, overview, navigation, navigationCss, coursePage, sheetLoader, packageJson] = await Promise.all([
  source("app/PublicMatchCard.js"),
  source("app/live/live.module.css"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/page.js"),
  source("app/history/HistoryNavigation.js"),
  source("app/history/history-navigation.module.css"),
  source("app/courses/[courseId]/page.js"),
  source("lib/google-sheets-data.js"),
  source("package.json").then(JSON.parse),
]);

const player = (name, stroke) => ({ id: name, name, stroke });

test("historical stroke text preserves visible copy and suppresses zero or missing values", () => {
  assert.equal(historicalStrokeText(1), "1 stroke received");
  assert.equal(historicalStrokeText(2), "2 strokes received");
  assert.equal(historicalStrokeText(0), "");
  assert.equal(historicalStrokeText(null), "");
  assert.equal(historicalStrokeText(undefined), "");
});

test("pairing slots cover every left/right stroke combination without changing participant order", () => {
  const combinations = [
    { label: "both golfers have strokes", left: [2, 4], right: [1, 3], expected: [[true, true], [true, true]] },
    { label: "neither golfer has strokes", left: [0, 0], right: [0, 0], expected: [[false, false], [false, false]] },
    { label: "left has strokes and right does not", left: [2, 3], right: [0, 0], expected: [[true, false], [true, false]] },
    { label: "right has strokes and left does not", left: [0, 0], right: [2, 3], expected: [[false, true], [false, true]] },
    { label: "Player 1 has strokes and Player 2 does not", left: [2, 0], right: [3, 0], expected: [[true, true], [false, false]] },
    { label: "Player 2 has strokes and Player 1 does not", left: [0, 2], right: [0, 3], expected: [[false, false], [true, true]] },
  ];

  for (const combination of combinations) {
    const left = combination.left.map((stroke, index) => player(`Left ${index + 1}`, stroke));
    const right = combination.right.map((stroke, index) => player(`Right ${index + 1}`, stroke));
    const rows = historicalPairingPlayerRows(left, right);
    assert.deepEqual(rows.map((row) => [Boolean(row.left.strokeText), Boolean(row.right.strokeText)]), combination.expected, combination.label);
    assert.deepEqual(rows.map((row) => [row.left.player.name, row.right.player.name]), [
      ["Left 1", "Right 1"],
      ["Left 2", "Right 2"],
    ], combination.label);
  }
});

test("Best Ball and Scramble use shared name/stroke grid rows with invisible reserved stroke lines", () => {
  assert.match(matchCard, /function CompactHistoricalPairing/);
  assert.match(matchCard, /historicalPairingPlayerRows\(teamOnePlayers, teamTwoPlayers\)/);
  assert.match(matchCard, /<CompactHistoricalPlayerName player=\{row\.left\.player\} side="1" slot=\{row\.slot\}/);
  assert.match(matchCard, /<CompactHistoricalPlayerName player=\{row\.right\.player\} side="2" slot=\{row\.slot\}/);
  assert.match(matchCard, /<CompactHistoricalStrokeLine label=\{row\.left\.strokeText\} side="1" slot=\{row\.slot\}/);
  assert.match(matchCard, /<CompactHistoricalStrokeLine label=\{row\.right\.strokeText\} side="2" slot=\{row\.slot\}/);
  assert.match(matchCard, /data-empty=\{empty \? "true" : undefined\}/);
  assert.match(matchCard, /aria-hidden=\{empty \? "true" : undefined\}/);
  assert.match(matchCard, />\{label \|\| "\\u00a0"\}<\/small>/);
  assert.match(matchCss, /historicalFinalPlayerName \{[^}]*align-self:\s*start/);
  assert.match(matchCss, /historicalFinalStrokeLine,[^{]+\{[^}]*min-height:\s*\.7375rem;[^}]*align-self:\s*stretch/);
  assert.match(matchCss, /historicalFinalStrokePlaceholder \{ visibility:\s*hidden; \}/);
});

test("Singles retain the existing compact side without pairing-only blank stroke rows", () => {
  const compact = matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"));
  assert.match(compact, /match\.format === "SI" \? <div className=\{styles\.historicalFinalMatchup\}>/);
  assert.match(compact, /<CompactHistoricalSide team=\{tournament\.teamOne\}/);
  assert.match(compact, /: <CompactHistoricalPairing/);
});

test("2025 remains on its accepted Birdie Leader source while 2026 removes the duplicate category", () => {
  assert.match(roundPage, /\.\.\.\(!completed2025 && !useSupabase2026 \? \[\{ label: "Most Birdies"/);
  assert.match(roundPage, /const roundBirdieLeader = \(completedHistoryMaster \|\| useSupabase2026\) && archive\.format === "SC"[\s\S]*roundStatistics\.mostBirdies[\s\S]*roundStatistics\.birdieLeader/);
  assert.match(roundPage, /const birdieLeaderHolders = completedHistoryMaster && archive\.format === "SC"[\s\S]*scrambleStatisticHolders\?\.mostBirdies/);
  assert.match(roundPage, /label: "Birdie Leader"[\s\S]*holders: birdieLeaderHolders/);
});

test("2025 year navigation appears once immediately below the hero with bounded destinations", () => {
  const heroIndex = overview.indexOf("data-completed-prototype={useCompletedMaster ? String(tournament.year) : undefined}");
  const yearNavigationIndex = overview.indexOf('surface="year"');
  const contentIndex = overview.indexOf("<section className={styles.content}>");
  assert.ok(heroIndex >= 0 && heroIndex < yearNavigationIndex);
  assert.ok(yearNavigationIndex < contentIndex);
  assert.equal((overview.match(/surface="year"/g) || []).length, 1);
  assert.match(overview, /href: historyPresentationHref\(`\/history\/\$\{previousYear\}`, participantPresentation\)[\s\S]*ariaLabel: `Previous Year, \$\{previousYear\}`/);
  assert.match(overview, /href: historyPresentationHref\("\/history", participantPresentation\)[\s\S]*ariaLabel: "All Tournament Years"/);
  assert.match(overview, /href: historyPresentationHref\(`\/history\/\$\{nextYear\}`, participantPresentation\)[\s\S]*ariaLabel: `Next Year, \$\{nextYear\}`/);
  assert.doesNotMatch(overview, /tournamentYearNavigationBottom/);
});

test("the completed-year navigation stays compact, focusable, and one row on mobile", () => {
  assert.match(navigation, /<nav[\s\S]*aria-label=\{ariaLabel\}/);
  assert.match(navigationCss, /\.navigation \{[^}]*min-height:\s*62px/);
  assert.match(navigationCss, /\.destination \{[^}]*min-height:\s*44px/);
  assert.match(navigationCss, /\.destination:focus-visible/);
  assert.match(navigationCss, /\.navigation\[data-count="3"\] \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
});

test("2025 History-context Course Profiles expose explicit round and tournament returns", () => {
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2025", round: "2" }), {
    href: "/history/2025/round/2",
    label: "Back to 2025 Round 2",
  });
  assert.deepEqual(historyCourseTournamentReturn({ source: "history", year: "2025", round: "2" }), {
    href: "/history/2025",
    label: "2025 Tournament",
  });
  assert.deepEqual(historyCourseTournamentReturn({ source: "history", year: "2026", round: "2" }), {
    href: "/history/2026",
    label: "2026 Tournament",
  });
  assert.equal(historyCourseTournamentReturn({ view: "archive" }), null);
  assert.match(coursePage, /tournamentReturn \? <HistoryNavigation/);
  assert.match(coursePage, /href: coursePresentationHref\(tournamentReturn\.href, participantPresentation\)[\s\S]*direction: "left"/);
  assert.match(coursePage, /href: coursePresentationHref\(historyReturn\.href, participantPresentation\)[\s\S]*direction: "right"/);
  assert.match(coursePage, /historyReturn && !tournamentReturn \? <nav[\s\S]*href=\{coursePresentationHref\(historyReturn\.href, participantPresentation\)\}/);
  assert.match(coursePage, /!historyReturn && originReturn \? <Link[\s\S]*href=\{coursePresentationHref\(originReturn\.href, participantPresentation\)\}/);
  assert.doesNotMatch(coursePage, /history\.back|router\.back/);
});

test("Course dual navigation is mobile-safe while archived Course reads remain exactly two", () => {
  assert.match(navigationCss, /\.navigation\[data-count="2"\] \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(navigationCss, /\.destination \{[^}]*min-height:\s*44px/);
  assert.match(navigationCss, /\.destination:focus-visible/);
  const loader = sheetLoader.slice(
    sheetLoader.indexOf("export const loadArchivedCourseSheets"),
    sheetLoader.indexOf("export const loadTournamentGuideSheets")
  );
  assert.equal((loader.match(/fetchSheet\(/g) || []).length, 2);
});

test("2025 request topology remains 14 overview reads, 12 round reads, and 2 Course reads", () => {
  const historicalSheetBlock = sheetLoader.slice(
    sheetLoader.indexOf("const HISTORICAL_SHEETS ="),
    sheetLoader.indexOf("export const GUIDE_SHEETS")
  );
  const scorecardSheetBlock = sheetLoader.slice(
    sheetLoader.indexOf("export const SCORECARD_SHEETS ="),
    sheetLoader.indexOf("// Historical and recorded-score data")
  );
  const draftSheetBlock = sheetLoader.slice(
    sheetLoader.indexOf("export const DRAFT_SHEETS ="),
    sheetLoader.indexOf("export const SCORECARD_SHEETS")
  );
  assert.equal((historicalSheetBlock.match(/:\s*"[^"]+"/g) || []).length, 10);
  assert.equal((scorecardSheetBlock.match(/:\s*"[^"]+"/g) || []).length, 2);
  assert.equal((draftSheetBlock.match(/:\s*"[^"]+"/g) || []).length, 2);
  assert.match(overview, /await getDraftByYear\(year\)/);
  assert.doesNotMatch(roundPage, /getDraftByYear/);
});

test("the micro pass adds no request, dependency, or scoring calculation", () => {
  for (const file of [matchCard, roundPage, overview, coursePage]) {
    assert.doesNotMatch(file, /fetch\(|\/api\/live|gviz|localStorage|sessionStorage/i);
  }
  assert.doesNotMatch(overview, /historicalPairingPlayerRows|roundBirdieLeader|history\.back|router\.back/);
  assert.doesNotMatch(roundPage, /build2025TournamentRecords|reduce\(|filter\(.*bird/i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "libphonenumber-js", "next", "openai", "qrcode", "react", "react-dom", "server-only", "web-push",
  ]);
});
