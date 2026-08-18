import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  completedHistoryHoleStatisticItem,
  formatCompletedHistoryToPar,
  orderCompletedHistoryRoundStatistics,
} from "../lib/completed-history-round-statistics.js";
import { buildHistoricalIndividualStatisticHolders } from "../lib/history-2024-net-projection.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [roundPage, statGrid, roundStatisticHelper, migrationRequirement] = await Promise.all([
  source("app/history/[year]/round/[round]/page.js"),
  source("app/ScoringStatGrid.js"),
  source("lib/completed-history-round-statistics.js"),
  source("docs/history-2023-migration-requirements.md"),
]);

const individualOrder = [
  "Lowest Front Nine",
  "Lowest Back Nine",
  "Lowest Round",
  "Birdie Leader",
  "Average Score",
  "Hardest Hole",
  "Easiest Hole",
];
const scrambleOrder = [
  "Lowest Front Nine",
  "Lowest Back Nine",
  "Lowest Team Round",
  "Birdie Leader",
  "Average Score",
  "Hardest Hole",
  "Easiest Hole",
];

const item = (label) => ({ label });
function ordered(format) {
  return orderCompletedHistoryRoundStatistics({
    format,
    lowestFrontNine: item("Lowest Front Nine"),
    lowestBackNine: item("Lowest Back Nine"),
    lowestRound: item("Lowest Round"),
    lowestTeamRound: item("Lowest Team Round"),
    birdieLeader: item("Birdie Leader"),
    averageScore: item("Average Score"),
    hardestHole: item("Hardest Hole"),
    easiestHole: item("Easiest Hole"),
  }).map((entry) => entry.label);
}

test("all six completed-year rounds use the exact format-specific statistic order", () => {
  const rounds = [
    [2024, 1, "BB", individualOrder],
    [2024, 2, "SC", scrambleOrder],
    [2024, 3, "SI", individualOrder],
    [2025, 1, "BB", individualOrder],
    [2025, 2, "SC", scrambleOrder],
    [2025, 3, "SI", individualOrder],
  ];
  for (const [year, round, format, expected] of rounds) {
    assert.deepEqual(ordered(format), expected, `${year} R${round}`);
  }
  assert.equal(ordered("SC").includes("Lowest Round"), false);
  assert.equal(ordered("SC").includes("Most Birdies"), false);
});

const difficultyEvidence = [
  [2024, 1, "BB", "hardest", 3, 4, 5.166666666666667, 1.1666666666666667, 24, "Black", "+1.2 TO PAR"],
  [2024, 1, "BB", "easiest", 11, 5, 4.875, -0.125, 24, "Black", "−0.1 TO PAR"],
  [2024, 2, "SC", "hardest", 10, 4, 4.166666666666667, 0.16666666666666666, 12, "Black", "+0.2 TO PAR"],
  [2024, 2, "SC", "easiest", 3, 5, 4.083333333333333, -0.9166666666666666, 12, "Black", "−0.9 TO PAR"],
  [2024, 3, "SI", "hardest", 3, 3, 3.875, 0.875, 24, "Black/Orange", "+0.9 TO PAR"],
  [2024, 3, "SI", "easiest", 10, 5, 4.625, -0.375, 24, "Black/Orange", "−0.4 TO PAR"],
  [2025, 1, "BB", "hardest", 2, 3, 4.041666666666667, 1.0416666666666667, 24, "Green", "+1.0 TO PAR"],
  [2025, 1, "BB", "easiest", 5, 3, 3, 0, 24, "Green", "EVEN TO PAR"],
  [2025, 2, "SC", "hardest", 4, 4, 5, 1, 12, "Black", "+1.0 TO PAR"],
  [2025, 2, "SC", "easiest", 14, 4, 3.5, -0.5, 12, "Black", "−0.5 TO PAR"],
  [2025, 3, "SI", "hardest", 7, 4, 5.142857142857143, 1.1428571428571428, 21, "Black", "+1.1 TO PAR"],
  [2025, 3, "SI", "easiest", 16, 4, 4, 0, 21, "Black", "EVEN TO PAR"],
];

test("all six canonical hole populations retain hole, par, average, sample, and one-decimal to-par evidence", () => {
  for (const [year, round, format, kind, holeNumber, par, average, delta, sample, tee, display] of difficultyEvidence) {
    assert.ok(Math.abs((average - par) - delta) < Number.EPSILON * 8, `${year} R${round} ${kind} arithmetic`);
    assert.equal(formatCompletedHistoryToPar(delta), display, `${year} R${round} ${kind} display`);
    const card = completedHistoryHoleStatisticItem({
      label: kind === "hardest" ? "Hardest Hole" : "Easiest Hole",
      hole: {
        holeNumber,
        par,
        tee,
        scoringAverage: { value: average, sampleSize: sample },
        averageToPar: { value: delta, sampleSize: sample, label: `Based on ${sample} recorded hole scores` },
      },
    });
    assert.equal(card.value, `#${holeNumber}`);
    assert.equal(card.detail, `${display} · ${tee} Tees`);
    assert.equal(card.sample, `Based on ${sample} recorded hole scores`);
    assert.match(card.accessibleLabel, new RegExp(`Hole ${holeNumber}`));
    assert.match(card.accessibleLabel, /plus|minus|even to par/);
  }
});

test("completed-year individual evidence feeds difficulty while 2024 R2 and 2025 keep their established populations", () => {
  assert.match(roundPage, /const courseDifficultyStatistics = canonical2023IndividualStatistics \|\| canonical2024IndividualStatistics \|\| roundStatistics/);
  assert.match(roundPage, /completedHistoryMaster[\s\S]*completedHistoryHoleStatisticItem/);
  assert.match(roundPage, /completedHistoryMaster \? completedHistoryRoundStatisticItems : legacyHistoricalRoundStatisticItems/);
  assert.match(roundPage, /const completedHistoryMaster = completed2023 \|\| completed2024 \|\| completed2025/);
});

test("completed individual rounds preserve every canonical tied holder without changing accepted values", () => {
  const scorecards = [
    ["Memo Saldana", 37, 76],
    ["Holman Moores", 37, 79],
    ["Miles Berger", 37, 76],
    ["David Tatum", 38, 80],
  ].map(([name, frontNine, total], index) => ({
    year: 2025,
    round: 3,
    format: "SI",
    matchId: `2025-R3-${index + 1}`,
    scoreType: "INDIVIDUAL",
    playerId: `P${index + 1}`,
    playerName: name,
    completedHoleCount: 18,
    frontNine,
    backNine: total - frontNine,
    total,
  }));
  const holders = buildHistoricalIndividualStatisticHolders({
    year: 2025,
    round: 3,
    scorecards,
    acceptedValues: { lowestFrontNine: 37, lowestRound: 76 },
  });
  assert.deepEqual(holders.lowestFrontNine.map((holder) => holder.name), ["Memo Saldana", "Holman Moores", "Miles Berger"]);
  assert.deepEqual(holders.lowestRound.map((holder) => holder.name), ["Memo Saldana", "Miles Berger"]);
  assert.match(roundPage, /const individualStatisticHolders = completedHistoryMaster && archive\.format !== "SC"/);
});

test("course-difficulty cards expose a full accessible sentence without changing the shared card family", () => {
  assert.match(statGrid, /aria-label=\{item\.accessibleLabel \|\| undefined\}/);
  assert.equal(formatCompletedHistoryToPar(0, { accessible: true }), "even to par");
  assert.equal(formatCompletedHistoryToPar(0.8, { accessible: true }), "plus 0.8 to par");
  assert.equal(formatCompletedHistoryToPar(-0.4, { accessible: true }), "minus 0.4 to par");
  assert.deepEqual(completedHistoryHoleStatisticItem({
    label: "Hardest Hole",
    hole: { holeNumber: 1, par: 4, scoringAverage: { value: 5 }, averageToPar: { value: null, sampleSize: 0 } },
  }), { label: "Hardest Hole", value: "—" });
});

test("future completed-year migrations carry the exact format order and evidence gate without activating 2023", () => {
  assert.match(migrationRequirement, /Best Ball and Singles: Lowest Front Nine → Lowest Back Nine → Lowest Round → Birdie Leader → Average Score → Hardest Hole → Easiest Hole/);
  assert.match(migrationRequirement, /Scramble: Lowest Front Nine → Lowest Back Nine → Lowest Team Round → Birdie Leader → Average Score → Hardest Hole → Easiest Hole/);
  assert.match(migrationRequirement, /canonical format-specific population supplies hole score, par, scoring average, and sample evidence/);
});

test("the pass adds no dependency, endpoint, request, or data source", () => {
  assert.doesNotMatch(roundStatisticHelper, /^import /m);
  for (const value of [roundPage, statGrid, roundStatisticHelper]) {
    assert.doesNotMatch(value, /fetch\(|axios|supabase\.from|\/api\//);
  }
});
