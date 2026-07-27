import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareMetricValues,
  COMPARISON_DIRECTIONS,
} from "../lib/player-comparison-utils.js";
import { buildHeadToHeadComparison } from "../lib/player-comparison.js";

test("comparison direction handles higher, lower, ties, informational, and missing values", () => {
  assert.equal(compareMetricValues(12, 8), "PLAYER_A");
  assert.equal(compareMetricValues(72, 75, COMPARISON_DIRECTIONS.LOWER), "PLAYER_A");
  assert.equal(compareMetricValues(10, 10), "TIE");
  assert.equal(compareMetricValues(3, 8, COMPARISON_DIRECTIONS.INFORMATIONAL), "TIE");
  assert.equal(compareMetricValues(null, undefined), "UNAVAILABLE");
  assert.equal(compareMetricValues(null, 4), "PLAYER_B");
});

test("direct-opposition intelligence keeps hole performance when official Ghost Match results are excluded", () => {
  const progressionMatch = {
    matchId: "M1",
    year: 2025,
    round: 2,
    format: "SI",
    sideA: { playerIds: ["P1"] },
    sideB: { playerIds: ["P2"] },
    holesWon: { A: 7, B: 5 },
    holesLost: { A: 5, B: 7 },
    holesHalved: 6,
    largestLead: { A: 3, B: 1 },
    largestComeback: 1,
    winnerSide: "A",
  };
  const scorecards = [
    {
      matchId: "M1",
      scoreType: "INDIVIDUAL",
      playerId: "P1",
      total: 73,
      holes: [{ score: 3, par: 4 }, { score: 4, par: 4 }],
    },
    {
      matchId: "M1",
      scoreType: "INDIVIDUAL",
      playerId: "P2",
      total: 75,
      holes: [{ score: 4, par: 4 }, { score: 5, par: 4 }],
    },
  ];
  const result = buildHeadToHeadComparison({
    playerAId: "P1",
    playerBId: "P2",
    official: {
      overall: { wins: 0, losses: 0, halves: 0, matches: 0 },
      meetings: [],
    },
    scorecards,
    progressionMatches: [progressionMatch],
  });

  assert.equal(result.officialRecordA.matches, 0);
  assert.equal(result.playerA.holesWon, 7);
  assert.equal(result.playerA.holeDifferential, 2);
  assert.equal(result.playerA.birdies, 1);
  assert.equal(result.playerA.averageGross, 73);
});

test("Compare Sandbaggers reuses shared analytics and renders all intelligence sections", async () => {
  const [page, component, service] = await Promise.all([
    readFile(new URL("../app/compare/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/compare/CompareTool.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/player-comparison.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /loadScorecardAnalytics/);
  assert.match(page, /buildPlayerComparisonProfiles/);
  assert.match(service, /buildPlayerHoleByHoleAnalytics/);
  assert.match(service, /buildMatchProgressionAnalytics/);
  for (const title of [
    "Player Overview",
    "Official Career Comparison",
    "Scorecard Intelligence",
    "Match Play Intelligence",
    "Format Performance",
    "Strengths and Tendencies",
    "Head-to-Head",
    "SBI Comparison Summary",
  ]) assert.match(component, new RegExp(title));
});
