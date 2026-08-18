import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  auditCanonical2023TournamentPoints,
  projectCanonical2023TournamentFinal,
  reconcileCanonical2023ScorecardPresentation,
} from "../lib/history-2023-projection.js";
import { buildHistoricalTournamentRecords } from "../lib/history-2025-tournament-records.js";
import { buildLegacyHistoryScorecardCoverage } from "../lib/legacy-history-scorecard-coverage.js";
import { reconstructMatchProgression } from "../lib/match-progression.js";
import { buildMatchNetScoring } from "../lib/scorecard-analytics.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [overviewPage, roundPage, matchCard, scorecardTable, sheetLoader, history2026Service] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/PublicMatchCard.js"),
  source("app/ScorecardTable.js"),
  source("lib/google-sheets-data.js"),
  source("lib/history-2026-service.js"),
]);

const correctedPoints = {
  1: [[0, 4], [4, 0], [0, 4], [3.5, 0.5], [0, 4], [0, 4]],
  2: [[0.5, 2.5], [2.5, 0.5], [0.5, 2.5], [0, 3], [0.5, 2.5], [0.5, 2.5]],
  3: [[0, 3], [3, 0], [3, 0], [1, 2], [1.5, 1.5], [1.5, 1.5], [2, 1], [2, 1], [0, 3], [1, 2], [0, 3], [2, 1]],
};

function correctedCanonicalMatches() {
  return Object.entries(correctedPoints).flatMap(([round, rows]) => rows.map(([team1, team2], index) => ({
    "Match ID": `2023-R${round}-${index + 1}`,
    Year: 2023,
    Round: Number(round),
    Match: index + 1,
    Format: Number(round) === 1 ? "BB" : Number(round) === 2 ? "SC" : "SI",
    "Matchup Winner": team1 === team2 ? "Halved" : team1 > team2 ? "Team 1" : "Team 2",
    "Team 1 Points": team1,
    "Team 2 Points": team2,
  })));
}

test("all 24 corrected allocations reconcile exactly to 29–49 without rounding half points", () => {
  const matches = correctedCanonicalMatches();
  const audit = auditCanonical2023TournamentPoints({ matches });
  assert.equal(audit.complete, true);
  assert.equal(audit.rows.length, 24);
  assert.deepEqual(audit.rounds.map((round) => [round.team1Points, round.team2Points]), [
    [7.5, 16.5],
    [4.5, 13.5],
    [17, 19],
  ]);
  assert.deepEqual([audit.team1Points, audit.team2Points], [29, 49]);
  assert.equal(audit.rows.filter((row) => row.team1Points % 1 || row.team2Points % 1).length, 8);

  const sourceTournament = {
    year: 2023,
    "Final Score": "50 - 28",
    championTeam: { side: "Team 2", name: "Dick's High Cutters" },
    runnerUpTeam: { side: "Team 1", name: "DT Floppers" },
  };
  const result = projectCanonical2023TournamentFinal({ tournament: sourceTournament, matches });
  assert.equal(result.applied, true);
  assert.equal(result.finalScore, "49 - 29");
  assert.equal(result.tournament["Final Score"], "49 - 29");
  assert.equal(sourceTournament["Final Score"], "50 - 28", "the fallback source row is not mutated");
});

test("the point projection fails closed for a missing match or non-half-point allocation", () => {
  const missing = correctedCanonicalMatches().slice(0, -1);
  assert.equal(auditCanonical2023TournamentPoints({ matches: missing }).complete, false);
  const quarterPoint = correctedCanonicalMatches();
  quarterPoint[0]["Team 1 Points"] = 0.25;
  assert.equal(auditCanonical2023TournamentPoints({ matches: quarterPoint }).complete, false);
});

function matchSevenScorecards() {
  const sideAWins = new Set([1, 6, 7, 8, 13, 16]);
  const sideBWins = new Set([3, 9, 10, 11, 14]);
  const holeWinners = Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1;
    const winnerSide = sideAWins.has(holeNumber) ? "A" : sideBWins.has(holeNumber) ? "B" : null;
    return { holeNumber, winnerSide, winnerType: winnerSide ? "PLAYER" : "HALVED" };
  });
  const scoring = {
    available: true,
    rows: [
      { side: 1, name: "Sonny Stepp", playerId: "SS01" },
      { side: 2, name: "Jason Powell", playerId: "JP01" },
    ],
    holeWinners,
  };
  return [
    { year: 2023, round: 3, matchNumber: 7, matchId: "2023-R3-7", format: "SI", side: 1, playerId: "SS01", playerName: "Sonny Stepp", teamName: "Sonny Stepp", matchNetScoring: scoring },
    { year: 2023, round: 3, matchNumber: 7, matchId: "2023-R3-7", format: "SI", side: 2, playerId: "JP01", playerName: "Jason Powell", teamName: "Jason Powell", matchNetScoring: scoring },
  ];
}

test("R3 Match 7 progression reconciles Sonny Stepp 1 Up at every approved checkpoint", () => {
  const scorecards = matchSevenScorecards();
  const progression = reconstructMatchProgression(scorecards);
  assert.equal(progression.winnerSide, "A");
  assert.equal(progression.finalMargin.label, "1 Up");
  assert.deepEqual([6, 9, 12, 15, 18].map((hole) =>
    progression.progression.find((step) => step.holeNumber === hole).position
  ), [1, 2, 0, 0, 1]);
  const reconciled = reconcileCanonical2023ScorecardPresentation({
    scorecards,
    matches: [{ "Match ID": "2023-R3-7", "Matchup Winner": "Team 1" }],
  });
  assert.equal(reconciled.every((card) => card.historyProgressionReconciled), true);
  assert.equal(reconciled.some((card) => card.historyProgressionSuppressed), false);
});

function completeCard({ matchId, format, side, playerId = "", teamId = "" }) {
  return {
    year: 2023,
    round: Number(matchId.match(/R(\d)/)?.[1]),
    matchId,
    format,
    scoreType: format === "SC" ? "TEAM" : "INDIVIDUAL",
    side,
    playerId,
    teamId,
    status: "COMPLETE",
    completedHoleCount: 18,
    total: 72,
    netAvailable: true,
    netTotals: { total: 72 },
    holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, score: 4, par: 4, netScore: 4 })),
  };
}

function missingCard(options) {
  return { ...completeCard(options), status: "MISSING", completedHoleCount: 0, total: null, netAvailable: false, netTotals: null, holes: [] };
}

test("partial coverage exposes only recorded identities and leaves zero-coverage Scramble matches closed", () => {
  const matches = [
    { "Match ID": "2023-R1-1", Year: 2023, Round: 1, Match: 1, Format: "BB", "Team 1 Player 1": "DT01", "Team 1 Player 2": "CP01", "Team 2 Player 1": "CO01", "Team 2 Player 2": "RH01" },
    { "Match ID": "2023-R2-3", Year: 2023, Round: 2, Match: 3, Format: "SC" },
    { "Match ID": "2023-R2-5", Year: 2023, Round: 2, Match: 5, Format: "SC" },
    { "Match ID": "2023-R3-5", Year: 2023, Round: 3, Match: 5, Format: "SI", "Team 1 Player 1": "CP01", "Team 2 Player 1": "JK01" },
  ];
  const scorecards = [
    completeCard({ matchId: "2023-R1-1", format: "BB", side: 1, playerId: "DT01" }),
    missingCard({ matchId: "2023-R1-1", format: "BB", side: 1, playerId: "CP01" }),
    completeCard({ matchId: "2023-R1-1", format: "BB", side: 2, playerId: "CO01" }),
    completeCard({ matchId: "2023-R1-1", format: "BB", side: 2, playerId: "RH01" }),
    missingCard({ matchId: "2023-R2-3", format: "SC", side: 1, teamId: "FLOPPERS" }),
    missingCard({ matchId: "2023-R2-3", format: "SC", side: 2, teamId: "DHC" }),
    missingCard({ matchId: "2023-R2-5", format: "SC", side: 1, teamId: "FLOPPERS" }),
    missingCard({ matchId: "2023-R2-5", format: "SC", side: 2, teamId: "DHC" }),
    missingCard({ matchId: "2023-R3-5", format: "SI", side: 1, playerId: "CP01" }),
    completeCard({ matchId: "2023-R3-5", format: "SI", side: 2, playerId: "JK01" }),
  ];
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2023, matches, scorecards, teamIds: ["FLOPPERS", "DHC"] });
  const byId = Object.fromEntries(coverage.matches.map((match) => [match.matchId, match]));
  assert.deepEqual([byId["2023-R1-1"].recordedLogicalScorecards, byId["2023-R1-1"].expectedLogicalScorecards, byId["2023-R1-1"].state], [3, 4, "PARTIAL"]);
  assert.deepEqual([byId["2023-R3-5"].recordedLogicalScorecards, byId["2023-R3-5"].expectedLogicalScorecards, byId["2023-R3-5"].state], [1, 2, "PARTIAL"]);
  assert.equal(byId["2023-R2-3"].state, "NONE");
  assert.equal(byId["2023-R2-5"].state, "NONE");
  assert.deepEqual(coverage.availableMatchIds.sort(), ["2023-R1-1", "2023-R3-5"]);
});

test("partial Best Ball and Singles retain supported Net rows without fabricating Hole Winners", () => {
  const card = (side, playerId) => ({
    side,
    playerId,
    playerName: playerId,
    sideTeamId: `T${side}`,
    year: 2023,
    netAvailable: true,
    netTotals: { frontNine: 36, backNine: 36, total: 72, toPar: 0 },
    holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, netScore: 4, netToPar: 0 })),
  });
  const match = { Year: 2023, Round: 1, Match: 1, Format: "BB", "Team 1 Player 1": "DT01", "Team 1 Player 2": "CP01", "Team 2 Player 1": "CO01", "Team 2 Player 2": "RH01" };
  const bestBall = buildMatchNetScoring([card(1, "DT01"), card(2, "CO01"), card(2, "RH01")], match, []);
  assert.equal(bestBall.available, false);
  assert.equal(bestBall.rows.find((row) => row.side === 1).available, false);
  assert.equal(bestBall.rows.find((row) => row.side === 2).available, true);
  assert.equal(bestBall.holeWinners.every((hole) => hole.winnerType === "UNAVAILABLE"), true);

  const singles = buildMatchNetScoring([card(2, "JK01")], { Year: 2023, Round: 3, Match: 5, Format: "SI" }, []);
  assert.equal(singles.available, false);
  assert.equal(singles.rows.length, 1);
  assert.equal(singles.rows[0].available, true);
  assert.equal(singles.holeWinners.every((hole) => hole.winnerType === "UNAVAILABLE"), true);
});

test("the 2023 record model derives Birdie provenance from all 46 individual rounds and 828 holes", () => {
  const names = ["Holman Moores", "Matthew Smith", "Miles Berger", ...Array.from({ length: 20 }, (_, index) => `Player ${index + 4}`)];
  const individuals = Array.from({ length: 46 }, (_, index) => {
    const playerIndex = index % 23;
    const leader = playerIndex < 3;
    const birdies = leader ? (index < 23 ? 4 : 3) : 0;
    return {
      year: 2023,
      round: index < 23 ? 1 : 3,
      format: index < 23 ? "BB" : "SI",
      matchId: `I-${index}`,
      scoreType: "INDIVIDUAL",
      playerId: `P${playerIndex}`,
      playerName: names[playerIndex],
      status: "COMPLETE",
      completedHoleCount: 18,
      total: 80 + (index % 10),
      frontNine: 40,
      backNine: 40 + (index % 10),
      holes: Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, par: 4, score: hole < birdies ? 3 : 4 })),
    };
  });
  const records = buildHistoricalTournamentRecords({ year: 2023, scorecards: individuals, matches: [], teams: [] });
  assert.equal(records.populations.completeIndividuals, 46);
  assert.equal(records.populations.individualHoleObservations, 828);
  assert.equal(records.proofs.birdieLeader.value, "7");
  assert.deepEqual(records.proofs.birdieLeader.winners.map((winner) => winner.context.holder), ["Holman Moores", "Matthew Smith", "Miles Berger"]);
  assert.equal(records.proofs.birdieLeader.sample, "46 individual rounds · 828 holes");
});

test("2023-only record holder blocks and partial scorecard semantics are wired without changing frozen years", () => {
  assert.match(overviewPage, /const structured2023Holders = Number\(tournament\.year\) === 2023/);
  assert.match(overviewPage, /data-record-holder-block/);
  assert.match(overviewPage, /holder\.classification === "TEAM" && holder\.team/);
  assert.match(overviewPage, /const birdieRecord = item\.key === "birdie-leader"/);
  assert.match(roundPage, /scorecardCoverageForMatch\(match\.id\)\?\.state !== "NONE"/);
  assert.match(roundPage, /completed2023 \? <PublicMatchCard[\s\S]*scorecardCoverage=\{scorecardCoverageForMatch\(match\.id\)\}/);
  assert.match(scorecardTable, /Partial historical scorecard/);
  assert.match(scorecardTable, /suppressHoleWinners=\{partialIdentityCoverage\}/);
  assert.match(matchCard, /historyYear === 2023 && match\.id === "2023-R3-7"/);
  assert.match(matchCard, /completedHistoricalSegmentParticipant/);
  assert.match(matchCard, /participant=\{completedHistoricalSegmentParticipant\(match\.frontWinner\)\}/);
});

test("2023 completed History authority is production Google Matches, not Supabase or the bundled fallback", () => {
  const canonicalLoader = sheetLoader.slice(
    sheetLoader.indexOf("export const loadCanonical2023HistoricalData"),
    sheetLoader.indexOf("export const loadArchivedCourseSheets")
  );
  assert.match(canonicalLoader, /sheetName === HISTORICAL_SHEETS\.matches/);
  assert.match(canonicalLoader, /PRODUCTION_SPREADSHEET_ID/);
  assert.match(canonicalLoader, /preserveCanonicalMatchesOnFallback: true/);
  assert.doesNotMatch(canonicalLoader, /supabase|scoring_authority/i);
  assert.match(history2026Service, /scoped only to tournament 2026/i);
  assert.match(overviewPage, /projectCanonical2023TournamentFinal/);
  assert.doesNotMatch(roundPage, /createClient|supabase\.from|\/api\/|axios/i);
});
