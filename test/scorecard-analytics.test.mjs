import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScorecardAnalytics,
  buildScoringHighlights,
  buildScoringRecords,
  calculateScorecardMetrics,
  filterScorecards,
  summarizeScorecards,
} from "../lib/scorecard-analytics.js";

const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const courseHoles = pars.map((par, index) => ({
  "Course ID": "C1",
  Tee: "Black",
  "Hole Number": index + 1,
  Yardage: par === 3 ? 165 : par === 5 ? 525 : 410,
  Par: par,
  "Stroke Index": index + 1,
}));
const courses = [{ Year: 2025, Round: 1, "Course ID": "C1", Course: "Test Course", Tee: "Black" }];
const teamNames = [
  { Year: 2025, "Team Side": "Team 1", "Team ID": "T1" },
  { Year: 2025, "Team Side": "Team 2", "Team ID": "T2" },
];

function match(matchId, format, players, matchNumber) {
  return {
    "Match ID": matchId,
    Year: 2025,
    Round: 1,
    Match: matchNumber,
    Format: format,
    "Course ID": "C1",
    Tee: "Black",
    "Team 1 Team ID": "T1",
    "Team 2 Team ID": "T2",
    "Team 1 Player 1": players[0],
    "Team 1 Player 2": players[1] || "",
    "Team 2 Player 1": players[2],
    "Team 2 Player 2": players[3] || "",
    "Team 1 Player 1 Stroke": 0,
    "Team 1 Player 2 Stroke": 0,
    "Team 2 Player 1 Stroke": 0,
    "Team 2 Player 2 Stroke": 0,
    "Team 1 Stroke": 0,
    "Team 2 Stroke": 0,
  };
}

const matches = [
  match("2025-R1-1", "BB", ["P1", "P2", "P3", "P4"], 1),
  match("2025-R1-2", "SC", ["P5", "P6", "P7", "P8"], 2),
  match("2025-R1-3", "SI", ["P9", "", "P10", ""], 3),
];
matches[0]["Team 1 Player 1 Stroke"] = 7;
matches[1]["Team 1 Stroke"] = 6;
matches[2]["Team 1 Player 1 Stroke"] = 4;

function scoreRow({
  matchId,
  matchNumber,
  format,
  playerId = "",
  teamId = "",
  status = "COMPLETE",
  scores = pars,
  scoreType,
}) {
  const row = {
    "Match ID": matchId,
    Year: 2025,
    Round: 1,
    Match: matchNumber,
    Format: format,
    "Course ID": "C1",
    "Player ID": playerId,
    "Team ID": teamId,
    "Score Type": scoreType || (teamId ? "TEAM" : "INDIVIDUAL"),
    Source: "Historical scorecard",
    Notes: "",
    "Scorecard Status": status,
  };
  scores.forEach((score, index) => {
    row[`Hole ${index + 1}`] = score;
  });
  return row;
}

const p1Scores = [...pars];
p1Scores[0] -= 1;
p1Scores[1] += 1;
const roundScorecards = [
  scoreRow({ matchId: "2025-R1-1", matchNumber: 1, format: "BB", playerId: "P1", status: "verified", scores: p1Scores }),
  ...["P2", "P3", "P4"].map((playerId) =>
    scoreRow({ matchId: "2025-R1-1", matchNumber: 1, format: "BB", playerId })
  ),
  scoreRow({ matchId: "2025-R1-2", matchNumber: 2, format: "SC", teamId: "T1" }),
  scoreRow({ matchId: "2025-R1-2", matchNumber: 2, format: "SC", teamId: "T2" }),
  scoreRow({
    matchId: "2025-R1-3",
    matchNumber: 3,
    format: "SI",
    playerId: "P9",
    status: "partial",
    scores: pars.slice(0, 9),
  }),
];

test("normalizes individual and team scorecards and resolves scramble participants", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });

  assert.equal(analytics.report.scorecardRowsLoaded, 7);
  assert.equal(analytics.report.verifiedScorecards, 1);
  assert.equal(analytics.report.completeScorecards, 5);
  assert.equal(analytics.report.partialScorecards, 1);
  assert.equal(analytics.report.individualScorecards, 5);
  assert.equal(analytics.report.teamScorecards, 2);
  assert.equal(analytics.report.matchesCovered, 3);
  assert.equal(analytics.report.coursesCovered, 1);

  const scramble = analytics.teamScorecards.find((card) => card.teamId === "T1");
  assert.deepEqual(scramble.participantPlayerIds, ["P5", "P6"]);
  assert.equal(scramble.playerId, undefined);
  assert.equal(scramble.courseName, "Test Course");
  assert.equal(scramble.total, 72);
  assert.equal(scramble.totalToPar, 0);
});

test("calculates reusable individual, nine-hole, streak, and scoring metrics", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });
  const p1 = analytics.scorecards.find((card) => card.playerId === "P1");
  const metrics = calculateScorecardMetrics(p1);

  assert.equal(p1.frontNine, 36);
  assert.equal(p1.backNine, 36);
  assert.equal(p1.total, 72);
  assert.equal(metrics.birdies.value, 1);
  assert.equal(metrics.birdies.sampleSize, 18);
  assert.equal(metrics.bogeys.value, 1);
  assert.equal(metrics.pars.value, 16);
  assert.equal(metrics.longestParStreak.value, 16);
  assert.equal(metrics.par3Average.value, 3);
  assert.equal(metrics.holes15To18.value, 16);
});

test("allocates official strokes, builds format net rows, and compares independent hole winners", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });
  const p1 = analytics.scorecards.find((card) => card.playerId === "P1");
  const bestBall = p1.matchNetScoring;
  const teamOneNet = bestBall.rows.find((row) => row.side === 1);
  const teamTwoNet = bestBall.rows.find((row) => row.side === 2);

  assert.equal(p1.strokesReceived, 7);
  assert.equal(p1.holes[0].strokesAllocated, 1);
  assert.equal(p1.holes[0].netScore, p1.holes[0].score - 1);
  assert.equal(p1.holes[7].strokesAllocated, 0);
  assert.equal(teamOneNet.type, "BEST_BALL_NET");
  assert.equal(teamOneNet.holes[0].netScore, 2);
  assert.equal(teamTwoNet.holes[0].netScore, 4);
  assert.equal(bestBall.holeWinners[0].winnerSide, "A");
  assert.equal(bestBall.holeWinners[1].winnerType, "HALVED");

  const scramble = analytics.scorecards.find((card) => card.matchId === "2025-R1-2" && card.side === 1);
  assert.equal(scramble.strokesReceived, 6);
  assert.equal(scramble.holes[0].netScore, scramble.holes[0].score - 1);
  assert.equal(scramble.matchNetScoring.rows.find((row) => row.side === 1).type, "SCRAMBLE_NET");
});

test("partial scorecards contribute holes and complete nines but never full-round metrics", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });
  const partial = analytics.scorecards.find((card) => card.playerId === "P9");
  const summary = summarizeScorecards([partial], 1);

  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.completedHoleCount, 9);
  assert.equal(partial.frontNine, 36);
  assert.equal(partial.backNine, null);
  assert.equal(partial.total, null);
  assert.equal(summary.recordedScoringAverage.value, null);
  assert.equal(summary.recordedScoringAverage.sampleSize, 0);
  assert.equal(summary.bestFrontNine.value, 36);
  assert.equal(summary.holeScoringAverage.sampleSize, 9);
});

test("detects expected missing scorecards without requiring a MISSING row", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });

  assert.equal(analytics.missingScorecards.length, 1);
  assert.equal(analytics.missingScorecards[0].playerId, "P10");
  assert.match(analytics.missingScorecards[0].reason, /No Round Scorecards row/);
  assert.ok(analytics.warnings.some((item) =>
    item.code === "Missing Expected Scorecard" && item.playerId === "P10"
  ));
});

test("course-hole summaries report sample size, percentages, and difficulty rank", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });
  const firstHole = analytics.courseHoleSummaries.find((hole) => hole.holeNumber === 1);
  const player = analytics.playerSummary("P1");

  assert.equal(firstHole.scoringAverage.sampleSize, 7);
  assert.equal(firstHole.par, 4);
  assert.equal(firstHole.bestScore.value, 3);
  assert.equal(firstHole.worstScore.value, 4);
  assert.equal(firstHole.birdiePercentage.sampleSize, 7);
  assert.ok(Number.isInteger(firstHole.difficultyRank));
  assert.equal(player.recordedScoringAverage.value, 72);
  assert.equal(player.recordedScoringAverage.label, "Based on 1 recorded round");
  assert.equal(player.scorecardCoverage.expected, 1);
});

test("shared highlights and records select round, player, team, and hole leaders", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });
  const highlights = buildScoringHighlights(analytics.usableScorecards, 8);
  const records = buildScoringRecords(analytics.usableScorecards);

  assert.equal(highlights.lowestRound.value, 72);
  assert.equal(highlights.lowestTeamRound.value, 72);
  assert.equal(highlights.scorecardCoverage.available, 7);
  assert.equal(highlights.scorecardCoverage.expected, 8);
  assert.equal(records.lowestRecordedRound.value, 72);
  assert.equal(records.lowestScrambleRound.value, 72);
  assert.ok(records.hardestHistoricalHole);
  assert.ok(records.easiestHistoricalHole);
});

test("shared scorecard filtering supports public page scopes", () => {
  const analytics = buildScorecardAnalytics({ roundScorecards, matches, courseHoles, courses, teamNames });

  assert.equal(filterScorecards(analytics.scorecards, { matchId: "2025-R1-2" }).length, 2);
  assert.equal(filterScorecards(analytics.scorecards, { playerId: "P5" }).length, 1);
  assert.equal(filterScorecards(analytics.scorecards, { year: 2025, round: 1, format: "SC" }).length, 2);
  assert.equal(filterScorecards(analytics.scorecards, { courseId: "C1" }).length, 7);
});

test("returns usable data plus structured validation warnings for bad rows", () => {
  const invalid = scoreRow({
    matchId: "2025-R1-1",
    matchNumber: 1,
    format: "SC",
    playerId: "NOT-IN-MATCH",
    status: "COMPLETE",
    scores: [25, ...pars.slice(1, 9)],
  });
  const analytics = buildScorecardAnalytics({
    roundScorecards: [invalid, { ...invalid }],
    matches,
    courseHoles,
    courses,
    teamNames,
  });
  const codes = new Set(analytics.warnings.map((item) => item.code));

  assert.equal(analytics.scorecards.length, 2);
  assert.ok(codes.has("Invalid Hole Score"));
  assert.ok(codes.has("Duplicate Scorecard"));
  assert.ok(codes.has("Scorecard Participant Not in Match"));
  assert.ok(codes.has("Complete Scorecard Missing Holes"));
  assert.ok(codes.has("Scorecard Format Mismatch"));
  assert.ok(analytics.warnings.every((item) => item.suggestedCorrection));
});

test("uses Hole Number as the only Course Holes schema field", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/scorecard-analytics.js", import.meta.url), "utf8")
  );
  assert.match(source, /"Hole Number"/);
  assert.doesNotMatch(source, /pick\(row,\s*"Hole"\)/);
});
