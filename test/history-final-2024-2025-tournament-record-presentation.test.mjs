import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildHistoricalBirdiePopulationProvenance,
  buildHistoricalTournamentRecords,
} from "../lib/history-2025-tournament-records.js";

const overviewPage = fs.readFileSync(new URL("../app/history/[year]/page.js", import.meta.url), "utf8");
const roundPage = fs.readFileSync(new URL("../app/history/[year]/round/[round]/page.js", import.meta.url), "utf8");

function individualCard({ year, playerId, birdies = 0, status = "COMPLETE" }) {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: 4,
    score: index < birdies ? 3 : 4,
    toPar: index < birdies ? -1 : 0,
  }));
  return {
    year,
    round: 1,
    matchNumber: Number(playerId.replace(/\D/g, "")) || 1,
    matchId: `${year}-R1-${playerId}`,
    format: "BB",
    scoreType: "INDIVIDUAL",
    playerId,
    playerName: `Golfer ${playerId}`,
    status,
    completedHoleCount: 18,
    total: holes.reduce((sum, hole) => sum + hole.score, 0),
    frontNine: holes.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: holes.slice(9).reduce((sum, hole) => sum + hole.score, 0),
    holes,
    courseName: "Canonical Course",
  };
}

test("Birdie provenance is derived from every canonical individual card and finite hole/par observation", () => {
  const cards = [
    individualCard({ year: 2024, playerId: "P1", birdies: 7 }),
    individualCard({ year: 2024, playerId: "P2", birdies: 2 }),
    individualCard({ year: 2024, playerId: "P3", birdies: 1 }),
    individualCard({ year: 2024, playerId: "P4", status: "MISSING" }),
  ];
  cards[2].holes[17].par = null;

  const provenance = buildHistoricalBirdiePopulationProvenance(cards);
  const expectedHoles = cards.slice(0, 3).reduce((total, card) =>
    total + card.holes.filter((hole) => Number.isFinite(hole.score) && Number.isFinite(hole.par)).length, 0);

  assert.deepEqual(provenance, {
    rounds: 3,
    holes: expectedHoles,
    label: `3 individual rounds · ${expectedHoles} holes`,
  });
});

test("completed-year Birdie records use the full population instead of only the winner's rounds", () => {
  for (const year of [2024, 2025]) {
    const cards = [
      individualCard({ year, playerId: "P1", birdies: 5 }),
      individualCard({ year, playerId: "P2", birdies: 2 }),
      individualCard({ year, playerId: "P3", birdies: 1 }),
    ];
    const records = buildHistoricalTournamentRecords({ year, scorecards: cards, matches: [], teams: [] });
    assert.equal(records.proofs.birdieLeader.value, "5");
    assert.equal(records.proofs.birdieLeader.sample, "3 individual rounds · 54 holes");
    assert.equal(records.proofs.birdieLeader.sampleSize, 54);
  }
});

test("2023 through 2025 Overview records share semantic holder blocks while older and current years stay isolated", () => {
  assert.match(overviewPage, /const structuredCompletedHolders = \[2023, 2024, 2025\]\.includes\(Number\(tournament\.year\)\)/);
  assert.match(overviewPage, /data-record-holder-list/);
  assert.match(overviewPage, /data-record-holder-block/);
  assert.match(overviewPage, /const birdieRecord = item\.label === "Birdie Leader"/);
  assert.match(overviewPage, /buildHistoricalBirdiePopulationProvenance\(completed2024IndividualStatisticScorecards\)/);
  assert.match(overviewPage, /winners: holders\.map/);
  assert.doesNotMatch(roundPage, /data-record-holder-block|recordHolderList|birdieHolderList/);
});

test("the 2024 record projection preserves every accepted value while adding presentation metadata", () => {
  const recordProjection = overviewPage.slice(
    overviewPage.indexOf("const completed2024Records"),
    overviewPage.indexOf("const completed2023Scorecards")
  );
  assert.match(recordProjection, /return \{\s*\.\.\.item,/);
  assert.match(recordProjection, /sample,\s*winners:/);
});
