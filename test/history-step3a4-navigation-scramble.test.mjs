import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  build2025ScrambleRoundStatisticHolders,
  canonicalize2025ScrambleScorecardPresentation,
} from "../lib/history-2025-tournament-records.js";
import { historyCourseReturn } from "../lib/history-course-navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  yearPage,
  roundPage,
  teamPage,
  historyPage,
  unavailablePage,
  backToTop,
  historicalCss,
  statCss,
  coursePage,
  guideGoogle,
  sheetLoader,
  components,
  packageJson,
] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("app/history/page.js"),
  source("app/history/HistoryUnavailable.js"),
  source("app/history/HistoryBackToTop.js"),
  source("app/historical.module.css"),
  source("app/scoring-stats.module.css"),
  source("app/courses/[courseId]/page.js"),
  source("app/tournament-guide/resolveGuideContentGoogle.js"),
  source("lib/google-sheets-data.js"),
  source("app/components.js"),
  source("package.json").then(JSON.parse),
]);

const completedOverview = yearPage.slice(
  yearPage.indexOf("function CompletedYearOverview"),
  yearPage.indexOf("function CurrentHistoryOverview")
);

const teams = [
  {
    id: "BANDON",
    name: "Bandon Brothers",
    side: "Team 1",
    roster: [
      ["MS", "Memo Saldana"], ["CL", "Caleb Lewis"],
      ["MH", "Michael Hunnicutt"], ["NJ", "Nick Julian"],
    ].map(([id, name]) => ({ player: { "Player ID": id, "Display Name": name } })),
  },
  {
    id: "CRISPY",
    name: "The Crispy Boys",
    side: "Team 2",
    roster: [
      ["HM", "Holman Moores"], ["DRJ", "David Rees-Jones"],
      ["WC", "Wade Caston"], ["ES", "Eric Stockley"],
    ].map(([id, name]) => ({ player: { "Player ID": id, "Display Name": name } })),
  },
];

const matches = [
  { "Match ID": "R2-M3", Year: 2025, Round: 2, Format: "SC", "Team 1 Player 1": "MS", "Team 1 Player 2": "CL", "Team 2 Player 1": "WC", "Team 2 Player 2": "ES" },
  { "Match ID": "R2-M4", Year: 2025, Round: 2, Format: "SC", "Team 1 Player 1": "MH", "Team 1 Player 2": "NJ", "Team 2 Player 1": "HM", "Team 2 Player 2": "DRJ" },
];

function scrambleCard({ matchId, side, teamId, teamName, front, back, birdies }) {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    score: index < birdies ? 3 : 4,
    par: 4,
    toPar: index < birdies ? -1 : 0,
  }));
  return {
    year: 2025,
    round: 2,
    matchId,
    matchNumber: Number(matchId.at(-1)),
    format: "SC",
    scoreType: "TEAM",
    side,
    teamId,
    teamName,
    participantPlayerIds: [],
    courseId: "BDGC01",
    courseName: "Bandon Dunes",
    completedHoleCount: 18,
    status: "COMPLETE",
    holes,
    frontNine: front,
    backNine: back,
    total: front + back,
  };
}

const scorecards = [
  scrambleCard({ matchId: "R2-M3", side: 1, teamId: "BANDON", teamName: "BANDONBROTHERS", front: 35, back: 31, birdies: 8 }),
  scrambleCard({ matchId: "R2-M3", side: 2, teamId: "CRISPY", teamName: "CRISPYBOYS", front: 40, back: 40, birdies: 0 }),
  scrambleCard({ matchId: "R2-M4", side: 1, teamId: "BANDON", teamName: "BANDONBROTHERS", front: 33, back: 36, birdies: 5 }),
  scrambleCard({ matchId: "R2-M4", side: 2, teamId: "SOURCE-TYPO", teamName: "CRIPSYBOYS", front: 33, back: 32, birdies: 8 }),
];

const holders = build2025ScrambleRoundStatisticHolders({
  scorecards,
  matches,
  teams,
  acceptedValues: {
    mostBirdies: 8,
    lowestFrontNine: 33,
    lowestBackNine: 31,
    lowestTeamRound: 65,
  },
});

test("the 2025 overview round rows contain only round, format, course, and the two actions", () => {
  assert.doesNotMatch(completedOverview, /roundResults|resultLabel|formatTeamPoints|Points Available|Total Points/);
  assert.match(completedOverview, /\{course\.Round\} · \{completedFormatName\(course\.Format\)\}/);
  assert.match(completedOverview, /<strong>\{course\.Course\}<\/strong>/);
  assert.match(completedOverview, /View Round/);
  assert.match(completedOverview, /Course Profile/);
});

test("Round History remains the owner of canonical round totals and results", () => {
  assert.match(roundPage, /archive\.teamOne\.points/);
  assert.match(roundPage, /archive\.teamTwo\.points/);
  assert.match(roundPage, /archive\.roundWinner/);
  assert.match(roundPage, /completedHistoryCompact=\{completed2025\}/);
});

test("Round 2 holder-specific Scramble statistics preserve tied canonical pairings", () => {
  assert.deepEqual(holders.mostBirdies.map(({ name, subtitle }) => [name, subtitle]), [
    ["Memo Saldana & Caleb Lewis", "Bandon Brothers"],
    ["Holman Moores & David Rees-Jones", "The Crispy Boys"],
  ]);
  assert.deepEqual(holders.lowestFrontNine.map(({ name, subtitle }) => [name, subtitle]), [
    ["Michael Hunnicutt & Nick Julian", "Bandon Brothers"],
    ["Holman Moores & David Rees-Jones", "The Crispy Boys"],
  ]);
  assert.deepEqual(holders.lowestBackNine.map(({ name, subtitle }) => [name, subtitle]), [
    ["Memo Saldana & Caleb Lewis", "Bandon Brothers"],
  ]);
  assert.deepEqual(holders.lowestTeamRound.map(({ name, subtitle }) => [name, subtitle]), [
    ["Holman Moores & David Rees-Jones", "The Crispy Boys"],
  ]);
});

test("Scramble holder presentation never exposes raw team identities", () => {
  const output = JSON.stringify(holders);
  for (const raw of ["CRISPYBOYS", "CRIPSYBOYS", "BANDONBROTHERS", "SOURCE-TYPO"])
    assert.doesNotMatch(output, new RegExp(raw));
  assert.match(roundPage, /holders: scrambleStatisticHolders\?\.mostBirdies/);
  assert.match(roundPage, /holders: scrambleStatisticHolders\?\.lowestFrontNine/);
  assert.match(roundPage, /holders: scrambleStatisticHolders\?\.lowestBackNine/);
  assert.match(roundPage, /holders: scrambleStatisticHolders\?\.lowestTeamRound/);
});

test("Round 2 scorecard disclosures replace raw team labels without changing scoring evidence", () => {
  const presented = canonicalize2025ScrambleScorecardPresentation({
    scorecards: [{
      ...scorecards[3],
      matchNetScoring: {
        rows: [{ side: 2, name: "CRISPYBOYS", netTotals: { total: 65 } }],
        holeWinners: [{ winnerSide: "B", winnerName: "CRISPYBOYS", holeNumber: 1 }],
      },
    }],
    teams,
  });
  assert.equal(presented[0].teamName, "The Crispy Boys");
  assert.equal(presented[0].matchNetScoring.rows[0].name, "The Crispy Boys");
  assert.equal(presented[0].matchNetScoring.holeWinners[0].winnerName, "The Crispy Boys");
  assert.equal(presented[0].total, scorecards[3].total);
  assert.equal(presented[0].holes, scorecards[3].holes);
  assert.doesNotMatch(JSON.stringify(presented), /CRISPYBOYS|CRIPSYBOYS|BANDONBROTHERS/);
  assert.match(roundPage, /canonicalize2025ScrambleScorecardPresentation/);
});

test("aggregate Round 2 statistics remain holder-free and unrecalculated", () => {
  for (const label of ["Average Score", "Hardest Hole", "Easiest Hole"])
    assert.match(roundPage, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(roundPage, /build2025TournamentRecords/);
  assert.match(roundPage, /buildScoringHighlights/);
});

test("History-aware Course returns are explicit, refresh-safe routes", () => {
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2025", round: "1" }), {
    href: "/history/2025/round/1",
    label: "Back to 2025 Round 1",
  });
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2025" }), {
    href: "/history/2025",
    label: "Back to 2025 History",
  });
  assert.equal(historyCourseReturn({ view: "archive" }), null);
  assert.equal(historyCourseReturn({ source: "history", year: "../../admin", round: "1" }), null);
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2025", round: "4" }), {
    href: "/history/2025",
    label: "Back to 2025 History",
  });
});

test("all 2025 Course Profile actions carry bounded History context while direct archive fallback remains Courses", () => {
  assert.match(completedOverview, /\?view=archive&source=history&year=\$\{tournament\.year\}&round=\$\{round\}/);
  assert.match(coursePage, /historyCourseReturn\(resolvedSearchParams\)/);
  assert.match(coursePage, /href: archive \? "\/courses\?view=archive" : "\/courses"/);
  assert.doesNotMatch(coursePage, /history\.back|router\.back/);
});

test("archived Course Profile uses only the existing Courses and Course Holes sources", () => {
  const loader = sheetLoader.slice(
    sheetLoader.indexOf("export const loadArchivedCourseSheets"),
    sheetLoader.indexOf("export const loadTournamentGuideSheets")
  );
  assert.equal((loader.match(/fetchSheet\(/g) || []).length, 2);
  assert.match(loader, /HISTORICAL_SHEETS\.courses/);
  assert.match(loader, /SCORECARD_SHEETS\.courseHoles/);
  assert.match(loader, /PRODUCTION_SPREADSHEET_ID/);
  assert.match(guideGoogle, /resolveGoogleArchivedCourseContent/);
  assert.doesNotMatch(guideGoogle.slice(guideGoogle.indexOf("resolveGoogleArchivedCourseContent")), /getTournamentData|refreshHistoricalData/);
  assert.match(coursePage, /resolveGoogleArchivedCourseContent/);
});

test("Round History keeps top navigation and replaces the duplicate bottom rail with one Back to Top", () => {
  assert.equal((roundPage.match(/<HistoricalDetailNavigation/g) || []).length, 1);
  assert.match(roundPage, /position="top"/);
  assert.equal((roundPage.match(/<HistoryBackToTop \/>/g) || []).length, 1);
  assert.doesNotMatch(roundPage, /<Footer variant="app" \/>/);
});

test("Back to Top is lightweight, accessible, request-free, and reduced-motion aware", () => {
  assert.match(backToTop, /"use client"/);
  assert.match(backToTop, /<button type="button"/);
  assert.match(backToTop, /aria-label="Back to top of page"/);
  assert.match(backToTop, /window\.scrollTo\(\{ top: 0, left: 0/);
  assert.match(backToTop, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(backToTop, /fetch\(|router\.|location\.|localStorage|sessionStorage/);
  assert.match(historicalCss, /historyBackToTop button[\s\S]*min-height:\s*44px/);
  assert.match(historicalCss, /historyBackToTop button:focus-visible/);
});

test("long Team History receives the same closing action without changing roster content", () => {
  assert.equal((teamPage.match(/<HistoryBackToTop \/>/g) || []).length, 1);
  assert.match(teamPage, /Tournament Handicap/);
  assert.match(teamPage, /rosterCaptainMarker/);
  assert.doesNotMatch(teamPage, /<Footer variant="app" \/>/);
});

test("redundant app footers are scoped out of History while public event footer remains intact", () => {
  for (const file of [historyPage, yearPage, roundPage, teamPage, unavailablePage])
    assert.doesNotMatch(file, /<Footer variant="app" \/>/);
  assert.match(components, /Sandbagger Invitational/);
  assert.match(components, /Official Tournament Website/);
  assert.match(components, /24 Players • Two Teams • One Trophy/);
});

test("long pairing names wrap and no new dependency or participant request is introduced", () => {
  assert.match(statCss, /holders b\{[^}]*overflow-wrap:anywhere/);
  for (const file of [completedOverview, roundPage, teamPage, backToTop, coursePage])
    assert.doesNotMatch(file, /\/api\/live|gviz|localStorage|sessionStorage/i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});
