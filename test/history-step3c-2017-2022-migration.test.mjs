import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  auditStep3CTournamentPoints,
  isStep3CCompletedHistoryYear,
  projectStep3CTournamentFinal,
} from "../lib/history-2017-2022-migration.js";
import { buildLegacyHistoryScorecardCoverage } from "../lib/legacy-history-scorecard-coverage.js";
import {
  historyCourseProfileHref,
  historyCourseReturn,
  historyCourseTournamentReturn,
} from "../lib/history-course-navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [overview, roundPage, teamPage, matchCard, sheets, scorecardData, stats, packageJson, auditDocument, migrationContract] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("app/PublicMatchCard.js"),
  source("lib/google-sheets-data.js"),
  source("lib/scorecard-data.js"),
  source("lib/stats.js"),
  source("package.json").then(JSON.parse),
  source("docs/history-2017-2022-step3c-evidence-audit.md"),
  source("docs/history-2017-2022-migration-contract.md"),
]);

function tournament(year, championSide = 1, stored = "") {
  return {
    year,
    "Final Score": stored,
    championTeam: { side: `Team ${championSide}` },
    runnerUpTeam: { side: `Team ${championSide === 1 ? 2 : 1}` },
  };
}

function match(year, round, number, team1Points, team2Points, result = "Team 1") {
  return {
    Year: year,
    Round: round,
    Match: number,
    "Match ID": `${year}-R${round}-${number}`,
    "Matchup Winner": result,
    "Team 1 Points": team1Points,
    "Team 2 Points": team2Points,
  };
}

test("Step 3C scopes exactly 2017–2022 and preserves every frozen year", () => {
  assert.deepEqual(
    [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].filter(isStep3CCompletedHistoryYear),
    [2017, 2018, 2019, 2020, 2021, 2022]
  );
  assert.match(overview, /const useCompletedMaster = useCompleted2023 \|\| useCompleted2024 \|\| useCompleted2025/);
  assert.match(roundPage, /const completedHistoryMaster = completed2023 \|\| completed2024 \|\| completed2025/);
  assert.match(matchCard, /completedHistoryCompact && \[2023, 2024, 2025\]\.includes\(historyYear\)/);
});

test("complete canonical match allocations derive exact champion-oriented Finals without rounding", () => {
  const matches = [
    match(2022, 1, 1, 3.5, 0.5),
    match(2022, 1, 2, 0, 4, "Team 2"),
    match(2022, 2, 1, 1.5, 1.5, "Halved"),
  ];
  const projected = projectStep3CTournamentFinal({
    year: 2022,
    tournament: tournament(2022, 2, "6 - 5"),
    matches,
  });
  assert.equal(projected.applied, true);
  assert.equal(projected.finalScore, "6 - 5");
  assert.deepEqual(projected.audit.matchDerivedFinal, [6, 5]);
  assert.equal(projected.audit.storedFinalReconciles, true);
  assert.deepEqual(projected.audit.rounds.map((round) => [round.round, round.team1Points, round.team2Points]), [
    [1, 3.5, 4.5],
    [2, 1.5, 1.5],
  ]);
});

test("incomplete point evidence fails closed and never invents a Tournament Final", () => {
  const sourceTournament = tournament(2017, 1, "");
  const matches = [match(2017, 1, 1, null, null)];
  const result = projectStep3CTournamentFinal({ year: 2017, tournament: sourceTournament, matches });
  assert.equal(result.applied, false);
  assert.equal(result.tournament, sourceTournament);
  assert.equal(result.audit.completePointAllocations, 0);
  assert.equal(result.audit.noPointAllocations, 1);
  assert.equal(result.audit.matchDerivedFinal, null);
});

test("invalid fractional points and duplicate match identities fail the reconciliation gate", () => {
  const rows = [
    match(2020, 1, 1, 1.25, 1.75),
    match(2020, 1, 1, 1, 2, "Team 2"),
  ];
  const audit = auditStep3CTournamentPoints({ year: 2020, tournament: tournament(2020), matches: rows });
  assert.equal(audit.complete, false);
  assert.equal(audit.matchDerivedFinal, null);
});

test("the production History workbook replaces, rather than supplements, the stale bundled boundary", () => {
  assert.match(sheets, /loadCanonical2017To2022HistoricalData[\s\S]*loadHistoricalDataFromSpreadsheet\(PRODUCTION_SPREADSHEET_ID\)/);
  assert.match(sheets, /loadCanonical2017To2022ScorecardSheets[\s\S]*loadScorecardSheetsWithHistoricalContext\(loadCanonical2017To2022HistoricalData\)/);
  assert.match(stats, /refreshCanonical2017To2022HistoricalData/);
  assert.match(stats, /Do not revive the known-stale bundled 2019\/2020 point populations/);
  assert.match(scorecardData, /loadCanonical2017To2022ScorecardSheets/);
  assert.match(auditDocument, /2019: fallback stored Final `228\.5–170\.5`/);
  assert.match(auditDocument, /2020: fallback stored Final and match sum `583–377`/);
});

test("the six audited years have result-only evidence and zero recorded scorecard identities", () => {
  for (const row of [
    [2017, 16, 16, 0],
    [2018, 20, 20, 0],
    [2019, 20, 20, 20],
    [2020, 24, 24, 24],
    [2021, 24, 24, 24],
    [2022, 24, 24, 24],
  ]) {
    assert.match(auditDocument, new RegExp(`\\| ${row[0]} \\| ${row[1]} \\| ${row[2]} \\| ${row[3]} \\| 0 \\| 0 \\|`));
  }
  assert.match(auditDocument, /All six years are `RESULT-ONLY`/);
  assert.match(auditDocument, /zero rows for every year from 2017 through 2022/);
});

test("zero scorecard rows produce no complete or partial match disclosures and no fabricated identity", () => {
  const matches = [
    {
      Year: 2019,
      Round: 1,
      Match: 1,
      Format: "BB",
      "Match ID": "2019-R1-1",
      "Team 1 Player 1": "A",
      "Team 1 Player 2": "B",
      "Team 2 Player 1": "C",
      "Team 2 Player 2": "D",
    },
    {
      Year: 2019,
      Round: 2,
      Match: 1,
      Format: "SC",
      "Match ID": "2019-R2-1",
      "Team 1 Player 1": "A",
      "Team 1 Player 2": "B",
      "Team 2 Player 1": "C",
      "Team 2 Player 2": "D",
    },
    {
      Year: 2019,
      Round: 3,
      Match: 1,
      Format: "SI",
      "Match ID": "2019-R3-1",
      "Team 1 Player 1": "A",
      "Team 2 Player 1": "C",
    },
  ];
  const coverage = buildLegacyHistoryScorecardCoverage({
    year: 2019,
    matches,
    scorecards: [],
    teamIds: ["T1", "T2"],
  });
  assert.deepEqual([coverage.completeMatchScorecards, coverage.partialMatchScorecards, coverage.noScorecardMatches], [0, 0, 3]);
  assert.deepEqual([coverage.recordedLogicalScorecards, coverage.expectedLogicalScorecards], [0, 8]);
  assert.deepEqual(coverage.availableMatchIds, []);
});

test("all six years reuse the frozen Overview hierarchy while unsupported sections are evidence-gated", () => {
  assert.match(overview, /useFrozenCompletedPresentation = useCompletedMaster \|\| useStep3CCompletedMaster/);
  assert.match(overview, /useStep3CCompletedMaster \? <CompletedYearOverview[\s\S]*records=\{\[\]\}[\s\S]*evidenceGatedSections/);
  const markers = [
    "data-completed-champion",
    "data-completed-rounds",
    "data-completed-teams",
    "data-completed-standings",
    "data-completed-records",
    "data-completed-honors",
  ];
  assert.deepEqual([...markers].sort((left, right) => overview.indexOf(left) - overview.indexOf(right)), markers);
  assert.match(overview, /!evidenceGatedSections \|\| allRecords\.length/);
  assert.match(overview, /!evidenceGatedSections \|\| tournament\.awards\.length/);
});

test("Round History uses the frozen Final card and omits zero-sample statistics", () => {
  assert.match(roundPage, /completedHistoryPresentation = completedHistoryMaster \|\| completedStep3C/);
  assert.match(roundPage, /completedStep3C \? <PublicMatchCard/);
  assert.match(roundPage, /scorecardCoverageForMatch\(match\.id\)\?\.state !== "NONE"/);
  assert.match(roundPage, /completedStep3C \? \(applicableRoundStatisticItems\.length \? <section/);
  assert.match(matchCard, /const state = completedHistoryCompact \? "final"/);
  assert.match(matchCard, /Team points not recorded/);
  assert.match(matchCard, /historyYear >= 2017 && historyYear <= 2022/);
});

test("year, Round, Team, and Course navigation remain explicit and deep-link safe", () => {
  assert.match(overview, /left=\{previousYear \?/);
  assert.match(overview, /right=\{nextYear \?/);
  assert.match(roundPage, /completedYear=\{Number\(archive\.year\) >= 2017 && Number\(archive\.year\) <= 2026\}/);
  assert.match(teamPage, /data-history-navigation|<HistoryNavigation/);
  assert.equal(historyCourseProfileHref({ courseId: "TNGC01", year: 2017, round: 1 }), "/courses/TNGC01?view=archive&source=history&year=2017&round=1");
  assert.deepEqual(historyCourseReturn({ source: "history", year: "2022", round: "3" }), {
    href: "/history/2022/round/3",
    label: "Back to 2022 Round 3",
  });
  assert.deepEqual(historyCourseTournamentReturn({ source: "history", year: "2019", round: "2" }), {
    href: "/history/2019",
    label: "2019 Tournament",
  });
});

test("the migration contract and runtime agree on evidence-first omission", () => {
  for (const phrase of [
    "zero recorded scoring identities means no Scorecard",
    "fail closed on ambiguity",
    "render only when the reconstructed Final reconciles",
    "Evidence determines whether a card exists",
    "individual Gross rounds only",
  ]) {
    assert.match(migrationContract, new RegExp(phrase));
  }
  assert.match(auditDocument, /No discrepancy was found/);
});

test("Step 3C adds no client fetch, dependency, endpoint, or scoring formula", () => {
  for (const routeSource of [overview, roundPage, teamPage]) {
    assert.doesNotMatch(routeSource, /fetch\(|\/api\/|supabase\.from|gviz\/tq/i);
  }
  assert.equal(packageJson.dependencies.next, "15.5.18");
  assert.doesNotMatch(JSON.stringify(packageJson.dependencies), /playwright|puppeteer|axios/i);
  assert.doesNotMatch(source.toString(), /gross\s*-\s*strokes/i);
});
