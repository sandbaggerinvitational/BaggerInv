import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildScorecardAnalytics,
  officialStrokeValue,
} from "../lib/scorecard-analytics.js";
import {
  calculateScrambleNetHoleScore,
  getStrokesOnHole,
} from "../lib/scorecard-net.js";
import { canonicalizeHistoricalScrambleScorecardPresentation } from "../lib/history-2025-tournament-records.js";
import { reconstructMatchProgression } from "../lib/match-progression.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  matchCard,
  scorecard,
  progressionSummary,
  overviewPage,
  roundPage,
  sheetsSource,
  recordsSource,
  packageJson,
  historicalData,
] = await Promise.all([
  source("app/PublicMatchCard.js"),
  source("app/ScorecardTable.js"),
  source("app/MatchProgressionSummary.js"),
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("lib/google-sheets-data.js"),
  source("lib/history-2025-tournament-records.js"),
  source("package.json").then(JSON.parse),
  source("lib/historical-data.json").then(JSON.parse),
]);

const mammothPars = [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4, 5, 3, 4, 5];
const montleyGross = [4, 4, 4, 3, 3, 4, 4, 3, 3, 5, 5, 4, 2, 3, 5, 3, 4, 4];
const queensGross = [4, 4, 3, 3, 4, 4, 4, 3, 4, 4, 5, 4, 2, 3, 4, 3, 4, 4];

function scorecardRow(teamId, scores) {
  const row = {
    "Match ID": "2024-R2-4",
    Year: 2024,
    Round: 2,
    Match: 4,
    Format: "SC",
    "Course ID": "MDGC01",
    "Team ID": teamId,
    "Score Type": "TEAM",
    "Scorecard Status": "COMPLETE",
  };
  scores.forEach((score, index) => { row[`Hole ${index + 1}`] = score; });
  return row;
}

function matchFourFixture(teamOneStroke) {
  const match = {
    "Match ID": "2024-R2-4",
    Year: 2024,
    Round: 2,
    Match: 4,
    Format: "SC",
    "Course ID": "MDGC01",
    "Team 1 Player 1": "WADE",
    "Team 1 Player 2": "CHASE",
    "Team 2 Player 1": "MURPHY",
    "Team 2 Player 2": "JUPJEE",
    "Team 1 Stroke": teamOneStroke,
    "Team 2 Stroke": "",
    "Matchup Winner": "Halved",
    "Team 1 Match Points": 1.5,
    "Team 2 Match Points": 1.5,
  };
  const teamNames = [
    { Year: 2024, "Team Side": "Team 1", "Team ID": "MONTLEY", "Team Name": "Möntley Crüe" },
    { Year: 2024, "Team Side": "Team 2", "Team ID": "QUEENS", "Team Name": "Queen's Mafia" },
  ];
  const players = [
    ["WADE", "Wade Caston"],
    ["CHASE", "Chase Patterson"],
    ["MURPHY", "Robert Murphy"],
    ["JUPJEE", "Jupjee Kochar"],
  ].map(([id, name]) => ({ "Player ID": id, "Display Name": name }));
  return {
    match,
    analyticsInput: {
      matches: [match],
      teamNames,
      players,
      roundScorecards: [
        scorecardRow("MONTLEY", montleyGross),
        scorecardRow("QUEENS", queensGross),
      ],
      courseHoles: mammothPars.map((par, index) => ({
        "Course ID": "MDGC01",
        Tee: "Black",
        "Hole Number": index + 1,
        Par: par,
        "Stroke Index": index === 6 ? 1 : index < 6 ? index + 2 : index + 1,
      })),
      courses: [{ Year: 2024, Round: 2, "Course ID": "MDGC01", Course: "Mammoth Dunes", Tee: "Black" }],
    },
    presentationTeams: [
      { id: "MONTLEY", name: "Möntley Crüe", side: 1, roster: [
        { player: { id: "WADE", name: "Wade Caston" } },
        { player: { id: "CHASE", name: "Chase Patterson" } },
      ] },
      { id: "QUEENS", name: "Queen's Mafia", side: 2, roster: [
        { player: { id: "MURPHY", name: "Robert Murphy" } },
        { player: { id: "JUPJEE", name: "Jupjee Kochar" } },
      ] },
    ],
  };
}

function progressionFor(fixture) {
  const analytics = buildScorecardAnalytics(fixture.analyticsInput);
  const cards = canonicalizeHistoricalScrambleScorecardPresentation({
    year: 2024,
    round: 2,
    scorecards: analytics.teamScorecards,
    matches: [fixture.match],
    teams: fixture.presentationTeams,
  });
  return {
    cards,
    progression: reconstructMatchProgression(cards.map((card) => ({
      ...card,
      matchNetScoring: card.historyProgressionMatchNetScoring,
    }))),
  };
}

test("2024 Match 4 source stroke remains canonical and zero remains distinct from missing", () => {
  const canonical = matchFourFixture(1);
  assert.equal(officialStrokeValue(canonical.match, 1), 1);
  assert.equal(officialStrokeValue(canonical.match, 2), 0);
  const absent = { ...canonical.match };
  delete absent["Team 2 Stroke"];
  assert.equal(officialStrokeValue(absent, 2), null);
});

test("the existing stroke helpers allocate Match 4's stroke to Hole 7 and produce 3 versus 4", () => {
  assert.equal(getStrokesOnHole(1, 1), 1);
  assert.equal(calculateScrambleNetHoleScore(4, getStrokesOnHole(1, 1)), 3);
  assert.equal(calculateScrambleNetHoleScore(4, getStrokesOnHole(0, 1)), 4);
});

test("the pre-repair projection reproduces the observed Hole 7 halve and false Queen's Mafia final", () => {
  const { cards, progression } = progressionFor(matchFourFixture(""));
  const sideOne = cards.find((card) => card.side === 1);
  const holeSeven = sideOne.historyProgressionMatchNetScoring.holeWinners.find((hole) => hole.holeNumber === 7);
  assert.equal(sideOne.historySummary.strokesReceived, 0);
  assert.equal(sideOne.holes[6].score, 4);
  assert.equal(sideOne.historyProgressionMatchNetScoring.rows.find((row) => row.side === 1).holes[6].netScore, 4);
  assert.equal(holeSeven.winnerType, "HALVED");
  assert.equal(progression.progression.find((step) => step.holeNumber === 9).position, 1);
  assert.equal(progression.winnerSide, "B");
  assert.equal(progression.finalMargin.label, "1 Up");
});

test("the canonical projection applies Hole 7 without changing gross evidence", () => {
  const { cards } = progressionFor(matchFourFixture(1));
  const sideOne = cards.find((card) => card.side === 1);
  const sideTwo = cards.find((card) => card.side === 2);
  const scoring = sideOne.historyProgressionMatchNetScoring;
  assert.equal(sideOne.holes[6].score, 4);
  assert.equal(sideTwo.holes[6].score, 4);
  assert.equal(sideOne.historySummary.strokesReceived, 1);
  assert.equal(sideOne.historySummary.netTotal, 66);
  assert.equal(sideTwo.historySummary.strokesReceived, 0);
  assert.equal(sideTwo.historySummary.netTotal, 66);
  assert.equal(scoring.rows.find((row) => row.side === 1).holes[6].netScore, 3);
  assert.equal(scoring.rows.find((row) => row.side === 2).holes[6].netScore, 4);
  assert.equal(scoring.holeWinners.find((hole) => hole.holeNumber === 7).winnerSide, "A");
});

test("Match 4 progression now reconciles 2 Up after 9 with a Halved final", () => {
  const { progression } = progressionFor(matchFourFixture(1));
  assert.equal(progression.progression.find((step) => step.holeNumber === 9).position, 2);
  assert.equal(progression.progression.find((step) => step.holeNumber === 12).position, 1);
  assert.equal(progression.progression.find((step) => step.holeNumber === 15).position, 0);
  assert.equal(progression.winnerSide, null);
  assert.equal(progression.finalMargin.label, "Halved");
});

test("the 2024 repair is generic and reuses the established scoring helpers", () => {
  assert.match(recordsSource, /canonicalizeHistoricalScrambleScorecardPresentation/);
  assert.match(recordsSource, /officialStrokeValue\(canonicalMatch, resolvedSide\)/);
  assert.match(recordsSource, /getStrokesOnHole\(summaryStrokes, hole\.strokeIndex\)/);
  assert.match(recordsSource, /calculateScrambleNetHoleScore\(hole\.score, strokesAllocated\)/);
  assert.match(recordsSource, /buildMatchNetScoring\(cards, match, scoringTeamRows\)/);
  assert.doesNotMatch(recordsSource, /2024-R2-4|Hole 7|Wade Caston|Chase Patterson|Robert Murphy|Jupjee Kochar/);
});

test("the 2024 data boundary redirects only Matches and keeps request topology constant", () => {
  assert.match(sheetsSource, /sheetName === HISTORICAL_SHEETS\.matches[\s\S]*PRODUCTION_SPREADSHEET_ID[\s\S]*SPREADSHEET_ID/);
  assert.match(sheetsSource, /Object\.entries\(HISTORICAL_SHEETS\)/);
  assert.match(sheetsSource, /Promise\.allSettled/);
  assert.doesNotMatch(roundPage, /fetch\(|axios|createClient|supabase\.from|\/api\/live/i);
});

test("all 24 canonical 2024 matches contain completed-result evidence", () => {
  const matches = historicalData.matches.filter((match) => Number(match.Year) === 2024);
  assert.equal(matches.length, 24);
  assert.ok(matches.every((match) => ["Team 1", "Team 2", "Halved"].includes(match["Matchup Winner"])));
  assert.ok(matches.every((match) => Number.isFinite(Number(match["Team 1 Points"]))));
  assert.ok(matches.every((match) => Number.isFinite(Number(match["Team 2 Points"]))));
});

test("2024 uses the frozen completed-year overview without copying 2025 facts", () => {
  assert.match(overviewPage, /const useCompleted2024 = !useSupabase2026 && Number\(tournament\.year\) === 2024/);
  assert.match(overviewPage, /const useCompletedMaster = useCompleted2023 \|\| useCompleted2024 \|\| useCompleted2025/);
  assert.match(overviewPage, /useCompletedMaster \? <CompletedYearOverview/);
  assert.doesNotMatch(overviewPage, /Bandon Dunes|Bandon Brothers|The Crispy Boys/);
});

test("2024 Overview preserves the existing record populations and holders", () => {
  assert.match(overviewPage, /scoringItems\(scoringStatistics, participant, tournament\.courses\)/);
  assert.match(overviewPage, /record\?\.scorecard\?\.playerName \|\| record\?\.scorecard\?\.teamName/);
  assert.doesNotMatch(overviewPage, /participantNames\.join\(" & "\)/);
});

test("2024 match cards are FINAL, omit matchup strokes, and put Scorecard before Details", () => {
  assert.match(roundPage, /const completedHistoryMaster = completed2023 \|\| completed2024 \|\| completed2025/);
  assert.match(roundPage, /completedHistoryCompact=\{completedHistoryMaster\}/);
  assert.match(matchCard, /const state = completedHistoryCompact \? "final"/);
  assert.match(matchCard, /completedHistoryMatchupCleanup = completedHistoryCompact && \[2023, 2024, 2025\]\.includes\(historyYear\)/);
  const compact = matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"), matchCard.indexOf("return <article className={styles.matchCard}", matchCard.indexOf("if (completedHistoryCompact)")));
  assert.ok(compact.indexOf("styles.historicalFinalResult") < compact.indexOf("<ScorecardTable"));
  assert.ok(compact.indexOf("<ScorecardTable") < compact.indexOf("<details className={styles.historicalMatchDetails}"));
});

test("2024 scorecards retain the frozen derived-row and Hole Winner grammar", () => {
  assert.match(matchCard, /stackPairingIdentities=\{historyScorecardParity\}/);
  assert.match(scorecard, /derivedRowLabel/);
  assert.match(scorecard, /hideHoleWinnerSummary=\{historyDensity\}/);
  assert.match(scorecard, /<strong>Hole Winner<\/strong>/);
});

test("Match Intelligence consumes the corrected shadow evidence with no new formula", () => {
  assert.match(progressionSummary, /historyProgressionMatchNetScoring/);
  assert.match(matchCard, /historyProgressionMatchNetScoring/);
  assert.match(roundPage, /canonicalizeHistoricalScrambleScorecardPresentation/);
  assert.doesNotMatch(progressionSummary, /calculateScrambleNetHoleScore|getStrokesOnHole|calculateHoleWinner/);
});

test("2024 statistics use performance-first order and omit zero-sample cards", () => {
  const start = roundPage.indexOf("const completedHistoryRoundStatisticItems");
  const end = roundPage.indexOf("const roundStatisticItems", start);
  const order = roundPage.slice(start, end);
  for (const label of ["lowestFrontNineStatisticItem", "lowestBackNineStatisticItem", "lowestRoundStatisticItem", "lowestTeamRoundStatisticItem", "birdieLeaderStatisticItem", "averageScoreStatisticItem", "hardestHoleStatisticItem", "easiestHoleStatisticItem"]) {
    assert.ok(order.includes(label));
  }
  assert.ok(order.indexOf("birdieLeaderStatisticItem") < order.indexOf("averageScoreStatisticItem"));
  assert.ok(order.indexOf("averageScoreStatisticItem") < order.indexOf("hardestHoleStatisticItem"));
  assert.match(roundPage, /!\/\^Based on 0 recorded\/i\.test/);
});

test("the frozen 2025 wrappers remain explicit and 2026 stays on its prior route", () => {
  assert.match(recordsSource, /canonicalize2025ScrambleScorecardPresentation[\s\S]*year: TARGET_YEAR/);
  assert.match(roundPage, /completed2025\s+\? canonicalize2025ScrambleScorecardPresentation/);
  assert.match(roundPage, /useSupabase2026 \? <HistoricalMatchRow/);
  assert.match(roundPage, /Number\(archive\.year\) === 2023/);
});

test("Step 3B.1 adds no dependency, endpoint, client fetch, or storage", () => {
  for (const value of [matchCard, scorecard, overviewPage, roundPage, recordsSource]) {
    assert.doesNotMatch(value, /axios|localStorage|sessionStorage|supabase\.from|\/api\/live/i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr",
    "@supabase/supabase-js",
    "@vercel/analytics",
    "libphonenumber-js",
    "next",
    "openai",
    "qrcode",
    "react",
    "react-dom",
    "server-only",
    "web-push",
  ]);
});
