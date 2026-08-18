import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { orderCompletedHistoryRoundStatistics } from "../lib/completed-history-round-statistics.js";
import {
  buildCanonical2023ScorecardContextProjection,
  reconcileCanonical2023ScorecardPresentation,
  selectCanonical2023IndividualStatisticScorecards,
  selectCanonical2023NetPresentationScorecards,
} from "../lib/history-2023-projection.js";
import { buildHistoricalTournamentRecords } from "../lib/history-2025-tournament-records.js";
import { buildLegacyHistoryScorecardCoverage } from "../lib/legacy-history-scorecard-coverage.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [archive, overviewPage, roundPage, matchCard, scorecard, progression, scorecardData, sheets, packageJson, migrationContract] = await Promise.all([
  source("lib/historical-data.json").then(JSON.parse),
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/PublicMatchCard.js"),
  source("app/ScorecardTable.js"),
  source("app/MatchProgressionSummary.js"),
  source("lib/scorecard-data.js"),
  source("lib/google-sheets-data.js"),
  source("package.json").then(JSON.parse),
  source("docs/history-2017-2022-migration-contract.md"),
]);

function holes(courseId, tee) {
  return Array.from({ length: 18 }, (_, index) => ({
    "Course ID": courseId,
    Tee: tee,
    "Hole Number": index + 1,
    Par: index % 6 === 0 ? 5 : index % 4 === 0 ? 3 : 4,
    "Stroke Index": index + 1,
  }));
}

function projectedCard({ round, match, identity, scoreType = "INDIVIDUAL", missing = false }) {
  const format = round === 1 ? "BB" : round === 2 ? "SC" : "SI";
  return {
    year: 2023,
    round,
    format,
    matchId: `2023-R${round}-${match}`,
    scoreType,
    ...(scoreType === "TEAM" ? { teamId: identity } : { playerId: identity }),
    status: missing ? "MISSING" : "COMPLETE",
    completedHoleCount: missing ? 0 : 18,
    total: missing ? null : 80,
    strokesReceived: missing ? null : 0,
    netAvailable: !missing,
    netTotals: missing ? null : { total: 80 },
    holes: missing ? [] : Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      score: 4,
      par: 4,
      strokeIndex: index + 1,
      netScore: 4,
      toPar: 0,
    })),
  };
}

function scorecardCoverageFixture() {
  const matches = [];
  const projected = [];
  const missing = new Set([
    "2023-R1-1|A1",
    "2023-R2-3|T1", "2023-R2-3|T2",
    "2023-R2-5|T1", "2023-R2-5|T2",
    "2023-R3-5|A1",
  ]);
  for (const [round, format, count] of [[1, "BB", 6], [2, "SC", 6], [3, "SI", 12]]) {
    for (let match = 1; match <= count; match += 1) {
      const matchId = `2023-R${round}-${match}`;
      matches.push({
        "Match ID": matchId,
        Year: 2023,
        Round: round,
        Match: match,
        Format: format,
        "Team 1 Player 1": `${matchId}-A1`,
        "Team 1 Player 2": format === "SI" ? "465" : `${matchId}-A2`,
        "Team 2 Player 1": `${matchId}-B1`,
        "Team 2 Player 2": format === "SI" ? "465" : `${matchId}-B2`,
      });
      const identities = format === "SC"
        ? [["T1", "TEAM"], ["T2", "TEAM"]]
        : format === "BB"
          ? [["A1", "INDIVIDUAL"], ["A2", "INDIVIDUAL"], ["B1", "INDIVIDUAL"], ["B2", "INDIVIDUAL"]]
          : [["A1", "INDIVIDUAL"], ["B1", "INDIVIDUAL"]];
      for (const [slot, scoreType] of identities) {
        projected.push(projectedCard({
          round,
          match,
          identity: scoreType === "TEAM" ? slot : `${matchId}-${slot}`,
          scoreType,
          missing: missing.has(`${matchId}|${slot}`),
        }));
      }
    }
  }
  const base = projected.map((card) => card.status === "MISSING" ? card : {
    ...card,
    netAvailable: false,
    netTotals: null,
    holes: card.holes.map((hole) => ({ ...hole, par: null, strokeIndex: null, netScore: null })),
  });
  return { matches, base, projected };
}

test("the canonical 2023 tournament baseline preserves all authoritative team points and the 50–28 Final", () => {
  const tournament = archive.tournaments.find((row) => Number(row.Year) === 2023);
  const matches = archive.matches.filter((row) => Number(row.Year) === 2023);
  assert.equal(tournament.Annual, "7th");
  assert.equal(tournament.Destination, "French Lick");
  assert.equal(tournament["Winning Team"], "Dick's High Cutters");
  assert.equal(tournament["Runner-Up Team"], "DT Floppers");
  assert.equal(tournament["Final Score"], "50 - 28");
  assert.equal(matches.length, 24);
  assert.deepEqual([1, 2, 3].map((round) => matches.filter((match) => Number(match.Round) === round).length), [6, 6, 12]);
  const roundPoints = [1, 2, 3].map((round) => matches.filter((match) => Number(match.Round) === round).reduce((sum, match) => [
    sum[0] + Number(match["Team 1 Points"]),
    sum[1] + Number(match["Team 2 Points"]),
  ], [0, 0]));
  assert.deepEqual(roundPoints, [[7.5, 16.5], [4.5, 13.5], [16, 20]]);
  assert.deepEqual(roundPoints.reduce((sum, row) => [sum[0] + row[0], sum[1] + row[1]], [0, 0]), [28, 50]);
  assert.ok(matches.every((match) => ["Team 1", "Team 2", "Halved"].includes(match["Matchup Winner"])));
});

test("the 2023 Course ID projection resolves only one complete round/format scoring set", () => {
  const courses = [
    { Year: 2023, Round: "Round 1", Format: "BB", "Course ID": "PDC01", Course: "The Pete Dye Course", "Tee Played": "Blue" },
    { Year: 2023, Round: "Round 2", Format: "SC", "Course ID": "PDC02", Course: "The Pete Dye Course", "Tee Played": "Blue" },
    { Year: 2023, Round: "Round 3", Format: "SI", "Course ID": "DRC01", Course: "The Donald Ross Course", "Tee Played": "Bronze" },
  ];
  const roundScorecards = [
    { Year: 2023, Round: 1, Format: "BB", "Course ID": "PDC01" },
    { Year: 2023, Round: 2, Format: "SC", "Course ID": "PDC02" },
    { Year: 2023, Round: 3, Format: "SI", "Course ID": "PDC02" },
  ];
  const result = buildCanonical2023ScorecardContextProjection({
    roundScorecards,
    courses,
    courseHoles: [...holes("PDC01", "Blue"), ...holes("PDC02", "Blue"), ...holes("DRC01", "Bronze")],
  });
  assert.deepEqual(result.audit.map((row) => row.state), ["EXACT", "EXACT", "RESOLVED_BY_ROUND_CONTEXT"]);
  assert.deepEqual(result.audit.map((row) => row.rows), [18, 18, 18]);
  assert.equal(result.projectedRoundScorecards[2]["Course ID"], "DRC01");
  assert.equal(roundScorecards[2]["Course ID"], "PDC02", "source evidence is not mutated");
});

test("ambiguous 2023 scoring context fails closed without a tee alias or source mutation", () => {
  const input = {
    roundScorecards: [{ Year: 2023, Round: 3, Format: "SI", "Course ID": "STALE" }],
    courses: [
      { Year: 2023, Round: "Round 3", Format: "SI", "Course ID": "DRC01", "Tee Played": "Bronze" },
      { Year: 2023, Round: "Round 3", Format: "SI", "Course ID": "DRC02", "Tee Played": "Bronze" },
    ],
    courseHoles: [...holes("DRC01", "Bronze"), ...holes("DRC02", "Bronze")],
  };
  const result = buildCanonical2023ScorecardContextProjection(input);
  assert.equal(result.audit[0].state, "AMBIGUOUS_COURSE");
  assert.equal(result.projectedRoundScorecards[0]["Course ID"], "STALE");
});

test("the established 20-of-24 eligibility contract is proven from six missing scoring identities", () => {
  const fixture = scorecardCoverageFixture();
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2023, matches: fixture.matches, scorecards: fixture.projected, teamIds: ["T1", "T2"] });
  assert.equal(fixture.projected.length, 60);
  assert.equal(fixture.projected.filter((card) => card.status === "MISSING").length, 6);
  assert.equal(coverage.completeMatchScorecards, 20);
  assert.deepEqual(coverage.rounds.map((round) => round.completeMatchScorecards), [5, 4, 11]);
  assert.deepEqual(coverage.rounds.map((round) => round.partialMatchScorecards), [1, 0, 1]);
  assert.deepEqual(coverage.rounds.map((round) => round.noScorecardMatches), [0, 2, 0]);
});

test("all 54 recorded scoring identities pass the existing canonical hole-level Net evidence gate", () => {
  const fixture = scorecardCoverageFixture();
  const selected = [1, 2, 3].flatMap((round) => selectCanonical2023NetPresentationScorecards({
    year: 2023,
    round,
    scorecards: fixture.base,
    projectedScorecards: fixture.projected,
  }));
  assert.equal(selected.length, 60);
  assert.equal(selected.filter((card) => card.status !== "MISSING").length, 54);
  assert.equal(selected.filter((card) => card.status !== "MISSING").every((card) => card.netAvailable && card.holes.every((hole) => Number.isFinite(hole.netScore))), true);
  const individuals = selectCanonical2023IndividualStatisticScorecards({ scorecards: fixture.base, projectedScorecards: fixture.projected });
  assert.equal(individuals.length, 46);
  assert.equal(individuals.filter((card) => card.round === 1).length, 23);
  assert.equal(individuals.filter((card) => card.round === 3).length, 23);
});

test("an incomplete Net projection cannot replace the evidence-preserving base", () => {
  const fixture = scorecardCoverageFixture();
  const projected = fixture.projected.filter((card) => !(card.round === 3 && card.matchId === "2023-R3-12"));
  const selected = selectCanonical2023NetPresentationScorecards({ year: 2023, round: 3, scorecards: fixture.base, projectedScorecards: projected });
  assert.equal(selected.some((card) => card.netAvailable), false);
});

function progressionCard(matchId, winnerSide) {
  const holeWinners = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    winnerType: index === 0 && winnerSide ? "PLAYER" : "HALVED",
    winnerSide: index === 0 ? winnerSide : null,
  }));
  return {
    year: 2023,
    round: 3,
    format: "SI",
    matchId,
    status: "COMPLETE",
    completedHoleCount: 18,
    side: 1,
    playerId: "P1",
    playerName: "Player One",
    matchNetScoring: { holeWinners, rows: [{ side: 1, name: "Player One" }, { side: 2, name: "Player Two" }] },
  };
}

test("progression is rendered only when the existing helper reconciles with the official result", () => {
  const halved = progressionCard("M-HALVED", null);
  const conflict = progressionCard("M-CONFLICT", "A");
  const reconciled = reconcileCanonical2023ScorecardPresentation({
    scorecards: [halved, conflict],
    matches: [
      { "Match ID": "M-HALVED", "Matchup Winner": "Halved" },
      { "Match ID": "M-CONFLICT", "Matchup Winner": "Halved" },
    ],
  });
  assert.equal(reconciled.find((card) => card.matchId === "M-HALVED").historyProgressionReconciled, true);
  assert.equal(reconciled.find((card) => card.matchId === "M-CONFLICT").historyProgressionSuppressed, true);
  assert.deepEqual(reconciled.find((card) => card.matchId === "M-CONFLICT").matchNetScoring.holeWinners, []);
  assert.match(progression, /historyProgressionSuppressed/);
  assert.match(matchCard, /historyProgressionSuppressed/);
});

test("completed 2023 uses the frozen Overview, Round, lifecycle, and disclosure hierarchy", () => {
  assert.match(overviewPage, /const useCompleted2023 = !useSupabase2026 && Number\(tournament\.year\) === 2023/);
  assert.match(overviewPage, /const useCompletedMaster = useCompleted2023 \|\| useCompleted2024 \|\| useCompleted2025/);
  const overviewMarkers = [
    "data-completed-champion", "data-completed-rounds", "data-completed-teams", "data-completed-standings", "data-completed-records", "data-completed-honors",
  ];
  assert.deepEqual([...overviewMarkers].sort((left, right) => overviewPage.indexOf(left) - overviewPage.indexOf(right)), overviewMarkers);
  assert.match(roundPage, /const completedHistoryMaster = completed2023 \|\| completed2024 \|\| completed2025/);
  assert.match(matchCard, /const state = completedHistoryCompact \? "final"/);
  assert.match(matchCard, /\[2023, 2024, 2025\]\.includes\(historyYear\)/);
  const compact = matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"), matchCard.indexOf("return <article className={styles.matchCard}", matchCard.indexOf("if (completedHistoryCompact)")));
  assert.ok(compact.indexOf("historicalFinalResult") < compact.indexOf("<ScorecardTable"));
  assert.ok(compact.indexOf("<ScorecardTable") < compact.indexOf("historicalMatchDetails"));
});

test("all 2023 formats use the exact completed-year Round Statistics order", () => {
  const item = (label) => ({ label });
  const base = {
    lowestFrontNine: item("Lowest Front Nine"),
    lowestBackNine: item("Lowest Back Nine"),
    lowestRound: item("Lowest Round"),
    lowestTeamRound: item("Lowest Team Round"),
    birdieLeader: item("Birdie Leader"),
    averageScore: item("Average Score"),
    hardestHole: item("Hardest Hole"),
    easiestHole: item("Easiest Hole"),
  };
  assert.deepEqual(orderCompletedHistoryRoundStatistics({ ...base, format: "BB" }).map((entry) => entry.label), ["Lowest Front Nine", "Lowest Back Nine", "Lowest Round", "Birdie Leader", "Average Score", "Hardest Hole", "Easiest Hole"]);
  assert.deepEqual(orderCompletedHistoryRoundStatistics({ ...base, format: "SC" }).map((entry) => entry.label), ["Lowest Front Nine", "Lowest Back Nine", "Lowest Team Round", "Birdie Leader", "Average Score", "Hardest Hole", "Easiest Hole"]);
  assert.deepEqual(orderCompletedHistoryRoundStatistics({ ...base, format: "SI" }).map((entry) => entry.label), ["Lowest Front Nine", "Lowest Back Nine", "Lowest Round", "Birdie Leader", "Average Score", "Hardest Hole", "Easiest Hole"]);
  const completedOrderSource = roundPage.slice(roundPage.indexOf("const completedHistoryRoundStatisticItems"), roundPage.indexOf("const roundStatisticItems"));
  assert.doesNotMatch(completedOrderSource, /Most Birdies/);
});

test("the tournament record contract excludes Scramble from the individual Average and preserves pairing ties", () => {
  const individualTotals = [81,88,86,78,93,84,95,82,83,75,91,79,82,86,100,95,95,75,89,93,103,92,80,95,82,70,81,74,88,75,72,87,74,71,88,82,90,97,86,80,90,85,96,82,83,92];
  const individuals = individualTotals.map((total, index) => ({
    year: 2023,
    round: index < 23 ? 1 : 3,
    format: index < 23 ? "BB" : "SI",
    matchId: `I-${index}`,
    scoreType: "INDIVIDUAL",
    playerId: `P-${index}`,
    playerName: index === 25 ? "Holman Moores" : `Player ${index}`,
    status: "COMPLETE",
    completedHoleCount: 18,
    total,
    frontNine: 40,
    backNine: total - 40,
    holes: Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, score: 4, par: 4 })),
  }));
  const teams = [
    { id: "T1", side: "Team 1", name: "DT Floppers", roster: [{ id: "A", name: "Holman Moores" }, { id: "B", name: "David Tatum" }] },
    { id: "T2", side: "Team 2", name: "Dick's High Cutters", roster: [{ id: "C", name: "Wade Caston" }, { id: "D", name: "Connor O'Reilly" }] },
  ];
  const matches = [{ "Match ID": "S-1", Year: 2023, Round: 2, Format: "SC", "Team 1 Player 1": "A", "Team 1 Player 2": "B", "Team 2 Player 1": "C", "Team 2 Player 2": "D" }];
  const scramble = [
    { year: 2023, round: 2, format: "SC", matchId: "S-1", scoreType: "TEAM", teamId: "T1", side: 1, status: "COMPLETE", completedHoleCount: 18, total: 66, frontNine: 33, backNine: 33, holes: Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, score: hole < 9 ? 3 : 4, par: 4 })) },
    { year: 2023, round: 2, format: "SC", matchId: "S-1", scoreType: "TEAM", teamId: "T2", side: 2, status: "COMPLETE", completedHoleCount: 18, total: 66, frontNine: 33, backNine: 33, holes: Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, score: hole < 9 ? 3 : 4, par: 4 })) },
  ];
  const records = buildHistoricalTournamentRecords({ year: 2023, scorecards: [...individuals, ...scramble], matches, teams });
  assert.equal(records.populations.completeIndividuals, 46);
  assert.equal(records.populations.completeScrambleTeams, 2);
  assert.equal(records.proofs.averageScore.numerator, 3925);
  assert.equal(records.proofs.averageScore.rawValue, 3925 / 46);
  assert.equal(records.proofs.averageScore.value, "85.3");
  assert.equal(records.proofs.bestTeam.value, "66");
  assert.equal(records.proofs.bestTeam.winners.length, 2);
  assert.match(records.proofs.bestTeam.detail, /Holman Moores & David Tatum/);
  assert.match(records.proofs.bestTeam.detail, /Wade Caston & Connor O'Reilly/);
});

test("2023 course/scoring loaders preserve the existing bounded request topology", () => {
  assert.match(sheets, /loadCanonical2023HistoricalData/);
  assert.match(sheets, /loadCanonical2023ScorecardSheets/);
  assert.match(scorecardData, /buildCanonical2023ScorecardContextProjection/);
  for (const file of [overviewPage, roundPage, scorecardData]) {
    assert.doesNotMatch(file, /axios|createClient|supabase\.from|\/api\/live|localStorage|sessionStorage/i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});

test("the future 2017–2022 handoff documents the completed-year evidence contract without activation", () => {
  for (const phrase of ["Course/tee preflight", "Net projection", "Match Intelligence", "Round Statistics", "Tournament Average", "Record holders", "Navigation"]) {
    assert.match(migrationContract, new RegExp(phrase, "i"));
  }
  assert.match(migrationContract, /does not activate or change those years/i);
  assert.doesNotMatch(overviewPage, /useCompleted2022|useCompleted2021|useCompleted2020|useCompleted2019|useCompleted2018|useCompleted2017/);
  assert.doesNotMatch(roundPage, /completed2022|completed2021|completed2020|completed2019|completed2018|completed2017/);
});
