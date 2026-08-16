import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { participantAppShellRoute, participantRouteContext } from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  yearPage,
  roundPage,
  matchCard,
  matchCss,
  roundCss,
  components,
  globals,
  coursePage,
  historyPage,
  historyTeamPage,
  archive,
  packageJson,
] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/PublicMatchCard.js"),
  source("app/live/live.module.css"),
  source("app/history/[year]/round/[round]/completed-round-2025.module.css"),
  source("app/components.js"),
  source("app/globals.css"),
  source("app/courses/[courseId]/page.js"),
  source("app/history/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("lib/historical-data.json").then(JSON.parse),
  source("package.json").then(JSON.parse),
]);

const completedOverview = yearPage.slice(
  yearPage.indexOf("function CompletedYearOverview"),
  yearPage.indexOf("function CurrentHistoryOverview")
);

test("participant History routes use The Bagger app shell while event branding remains distinct", () => {
  for (const route of ["/history", "/history/2025", "/history/2025/round/1", "/history/2025/team/Team%202", "/history/2026"])
    assert.equal(participantAppShellRoute(route), true, route);
  assert.equal(participantAppShellRoute("/"), false);
  assert.equal(participantRouteContext("/history/2025"), "2025 History");
  assert.equal(participantRouteContext("/history/2025/round/3"), "2025 Round History");
  assert.match(components, /appIdentity \? "The Bagger" : "Sandbagger Invitational"/);
  assert.match(components, /appIdentity \? null : <span>Official Tournament Website<\/span>/);
  assert.match(yearPage, /9th Annual Sandbagger Invitational|historyEditionLabel/i);
  assert.match(globals, /footer:not\(\[data-app-footer="true"\]\)/);
  for (const file of [historyPage, yearPage, roundPage, historyTeamPage]) assert.doesNotMatch(file, /<Footer variant="app" \/>/);
});

test("the 2025 overview removes only the dead scorecard summary and preserves final order", () => {
  assert.doesNotMatch(completedOverview, /data-completed-scorecards|Historical Scorecards|Scorecard detail available/);
  const markers = [
    "data-completed-champion",
    "data-completed-rounds",
    "data-completed-teams",
    "data-completed-standings",
    "data-completed-records",
    "data-completed-honors",
  ];
  const positions = markers.map((marker) => completedOverview.indexOf(marker));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("completed overview round summaries defer results to Round History", () => {
  assert.doesNotMatch(yearPage, /getHistoricalRound/);
  assert.doesNotMatch(completedOverview, /roundResults|resultLabel|formatTeamPoints/);
  assert.doesNotMatch(completedOverview, /Points Available/);
  assert.doesNotMatch(completedOverview, /Total Points/);
});

test("canonical 2025 round totals reconcile by match, round, and tournament", () => {
  const matches = archive.matches.filter((match) => Number(match.Year) === 2025);
  assert.equal(matches.length, 24);
  const totals = [1, 2, 3].map((round) => {
    const rows = matches.filter((match) => Number(match.Round) === round);
    return {
      round,
      matches: rows.length,
      teamOne: rows.reduce((sum, match) => sum + Number(match["Team 1 Points"]), 0),
      teamTwo: rows.reduce((sum, match) => sum + Number(match["Team 2 Points"]), 0),
    };
  });
  assert.deepEqual(totals, [
    { round: 1, matches: 6, teamOne: 9.5, teamTwo: 8.5 },
    { round: 2, matches: 6, teamOne: 11, teamTwo: 7 },
    { round: 3, matches: 12, teamOne: 18, teamTwo: 18 },
  ]);
  assert.deepEqual(
    totals.reduce((sum, round) => ({ teamOne: sum.teamOne + round.teamOne, teamTwo: sum.teamTwo + round.teamTwo }), { teamOne: 0, teamTwo: 0 }),
    { teamOne: 38.5, teamTwo: 33.5 }
  );
});

test("all three historical Course Profile actions use the existing archive route", () => {
  assert.match(completedOverview, /\/courses\/\$\{course\["Course ID"\]\}\?view=archive&source=history&year=\$\{tournament\.year\}&round=\$\{round\}/);
  assert.match(coursePage, /const archive = String\(resolvedSearchParams\?\.view \|\| ""\) === "archive"/);
  assert.match(coursePage, /resolveGoogleArchivedCourseContent/);
  assert.doesNotMatch(yearPage, /new course|createCourse|course profile fallback/i);
});

test("only 2025 legacy Round History opts into the compact final presentation", () => {
  assert.match(roundPage, /const completed2025 = !useSupabase2026 && Number\(archive\.year\) === 2025/);
  assert.match(roundPage, /completedHistoryCompact=\{completed2025\}/);
  assert.match(matchCard, /if \(completedHistoryCompact\)/);
  assert.match(roundPage, /useSupabase2026 \? <HistoricalMatchRow/);
  assert.doesNotMatch(roundPage, /year\s*>=\s*2017|\[2017,\s*2018/);
});

test("finalized 2025 match rows expose lifecycle, canonical format, participants, result, and points by default", () => {
  assert.match(roundPage, /<h2>\{canonicalFormat\}<\/h2>/);
  assert.match(matchCard, /const state = completedHistoryCompact \? "final" : matchState\(match\)/);
  assert.match(matchCard, /<MatchStatusBlock status="final"/);
  assert.match(matchCard, /CompactHistoricalSide/);
  assert.match(matchCard, /<span>Final result<\/span>/);
  assert.match(matchCard, /formatTeamPoints\(match\.team1Points\)/);
  assert.match(roundPage, /formatName: canonicalFormat/);
  assert.match(roundPage, /archive\.format === "BB"[\s\S]*"Best Ball"/);
  assert.doesNotMatch(matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"), matchCard.indexOf("return <article className={styles.matchCard}", matchCard.indexOf("if (completedHistoryCompact)") + 1)), /Format TBA|UPCOMING|Upcoming/);
});

test("Match Details holds progression and segment results while scorecard stays directly discoverable", () => {
  const compact = matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"), matchCard.indexOf("return <article className={styles.matchCard}", matchCard.indexOf("if (completedHistoryCompact)") + 1));
  assert.match(compact, /<summary>View Match Details/);
  assert.match(compact, /<MatchProgressionSummary scorecards=\{scorecards\}/);
  assert.match(compact, /<Segment label="Front 9"/);
  assert.match(compact, /<Segment label="Back 9"/);
  assert.match(compact, /<Segment label="Overall"/);
  assert.match(compact, /<ScorecardTable scorecards=\{scorecards\} compact historyDensity=\{historyDensity\} \/>/);
  assert.ok(compact.indexOf("<ScorecardTable") > compact.indexOf("</details>"));
});

test("Round Statistics are secondary and empty zero-sample categories are filtered without recalculation", () => {
  assert.match(roundPage, /applicableRoundStatisticItems/);
  assert.match(roundPage, /item\.value !== "—"/);
  assert.match(roundPage, /!\/\^Based on 0 recorded\/i/);
  assert.match(roundPage, /<summary>View Round Statistics/);
  assert.doesNotMatch(roundPage, /build2025TournamentRecords/);
  assert.match(roundCss, /min-height:\s*44px/);
});

test("round scorecard availability remains gated by accepted complete-match coverage", () => {
  assert.match(roundPage, /buildLegacyHistoryScorecardCoverage/);
  assert.match(roundPage, /completeLegacyMatchIds\.has\(match\.id\)/);
  assert.match(roundPage, /displayScorecardsForMatch\(match\.id\)/);
  const completedStatistics = roundPage.slice(
    roundPage.indexOf("{completed2025 ? (applicableRoundStatisticItems.length"),
    roundPage.indexOf(": <section className={styles.section}>", roundPage.indexOf("{completed2025 ? (applicableRoundStatisticItems.length"))
  );
  assert.doesNotMatch(completedStatistics, /Historical Scorecards|Scorecard detail available/);
});

test("compact result rows retain accessible labels, long-name wrapping, touch targets, focus, and reduced motion", () => {
  assert.match(matchCard, /aria-label=\{`Match \$\{match\.match\}, Final\./);
  assert.match(matchCss, /historicalFinalSide strong,[^{]+\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(matchCss, /historicalMatchDetails > summary \{ min-height: 44px/);
  assert.match(matchCss, /prefers-reduced-motion: reduce/);
  assert.match(roundCss, /prefers-reduced-motion: reduce/);
});

test("Step 3A.3 adds no request, endpoint, client persistence, or dependency", () => {
  for (const value of [completedOverview, roundPage, matchCard]) assert.doesNotMatch(value, /fetch\(|\/api\/live|gviz|createClient|supabase\.from|localStorage|sessionStorage/i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});

test("accepted Tournament Records, standings, Honors, and event facts remain model-driven", () => {
  assert.match(completedOverview, /build2025TournamentRecords/);
  assert.match(completedOverview, /historyStandingsSummary\(leaderboard, 5\)/);
  assert.match(completedOverview, /tournament\.awards\.map/);
  assert.match(yearPage, /tournament\["Final Score"\]/);
  assert.doesNotMatch(yearPage, /\b465\b/);
});
