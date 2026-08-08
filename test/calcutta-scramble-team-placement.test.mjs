import assert from "node:assert/strict";
import test from "node:test";
import { buildCalcuttaModel, calcuttaPublicationRecords, deriveCalcuttaRoundResults } from "../lib/calcutta.js";

const year = 2026;
const teamPointAwards = [200, 160, 120, 100, 80, 70, 60, 50, 40, 30, 20, 10];
const teamPayoutAwards = [12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1.5, 1];
const pointStructure = teamPointAwards.map((award, index) => ({ Year: year, Place: index + 1, "Round 2 Award": award }));
const payoutStructure = teamPayoutAwards.map((award, index) => ({ Year: year, Place: index + 1, "Round 2 Award %": award }));
const players = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`P${index + 1}`, { id: `P${index + 1}`, name: `Player ${index + 1}` }]));
const purchases = Object.keys(players).map((playerId) => ({ Year: year, "Golfer Player ID": playerId, "Purchase Price": 100 }));

function teamIds(index) {
  return [`P${index * 2 + 1}`, `P${index * 2 + 2}`];
}

function modelForScores(scores) {
  const teamRows = scores.map((net, index) => ({
    Year: year,
    Round: 2,
    Format: "Scramble",
    "Player IDs": teamIds(index).join(","),
    "Gross Score": net + 5,
    "Net Score": net,
    "Full Course Handicap": 5,
  }));
  return buildCalcuttaModel({
    year,
    players,
    purchases,
    pointStructure,
    payoutStructure,
    roundResults: deriveCalcuttaRoundResults({ year, roundResults: teamRows }),
  });
}

function expectedTeamAwards(scores, configured) {
  const sorted = scores.map((score, index) => ({ score, index })).sort((left, right) => left.score - right.score || left.index - right.index);
  const awards = Array(scores.length).fill(0);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].score === sorted[start].score) end += 1;
    const award = configured.slice(start, end).reduce((sum, value) => sum + value, 0) / (end - start);
    for (let cursor = start; cursor < end; cursor += 1) awards[sorted[cursor].index] = award;
    start = end;
  }
  return awards;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, message ?? `${actual} was not within tolerance of ${expected}`);
}

const scenarios = {
  "one team wins outright": [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
  "two teams tied for first": [60, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
  "three teams tied for first": [60, 60, 60, 63, 64, 65, 66, 67, 68, 69, 70, 71],
  "two teams tied in a middle placement": [60, 61, 62, 63, 63, 65, 66, 67, 68, 69, 70, 71],
  "three teams tied in a middle placement": [60, 61, 62, 63, 63, 63, 66, 67, 68, 69, 70, 71],
  "multiple separate ties": [60, 60, 62, 63, 63, 65, 66, 67, 68, 69, 70, 70],
  "last-place tie": [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 70],
  "no tie": [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
};

for (const [label, scores] of Object.entries(scenarios)) {
  test(`Round 2 team placement allocation: ${label}`, () => {
    const model = modelForScores(scores);
    const expectedPoints = expectedTeamAwards(scores, teamPointAwards);
    const expectedPayouts = expectedTeamAwards(scores, teamPayoutAwards).map((value) => value / 100);
    scores.forEach((_score, teamIndex) => {
      const members = teamIds(teamIndex).map((id) => model.golfers.find((golfer) => golfer.playerId === id));
      assert.equal(members.length, 2);
      assert.equal(members[0].rounds[2].points, expectedPoints[teamIndex] / 2);
      assert.equal(members[1].rounds[2].points, expectedPoints[teamIndex] / 2);
      assert.equal(members[0].rounds[2].points + members[1].rounds[2].points, expectedPoints[teamIndex]);
      assertClose(members[0].rounds[2].payoutPercent, expectedPayouts[teamIndex] / 2);
      assertClose(members[1].rounds[2].payoutPercent, expectedPayouts[teamIndex] / 2);
      assert.equal(members[0].totalPoints, members[0].rounds[2].points);
      assert.equal(members[1].totalPoints, members[1].rounds[2].points);
      assert.equal(members[0].rounds[2].place, members[1].rounds[2].place);
    });
    assertClose(model.golfers.reduce((sum, golfer) => sum + golfer.rounds[2].points, 0), teamPointAwards.reduce((sum, award) => sum + award, 0));
    assertClose(model.golfers.reduce((sum, golfer) => sum + golfer.rounds[2].payoutPercent, 0), teamPayoutAwards.reduce((sum, award) => sum + award, 0) / 100);
  });
}

test("Round 1 and Round 3 remain individual placement competitions", () => {
  const roundResults = [1, 3].flatMap((round) => [
    { Year: year, Round: round, Format: round === 1 ? "Best Ball" : "Singles", "Player ID": "P1", "Gross Score": 70, "Net Score": 60 },
    { Year: year, Round: round, Format: round === 1 ? "Best Ball" : "Singles", "Player ID": "P2", "Gross Score": 71, "Net Score": 61 },
  ]);
  const points = [1, 2].map((place) => ({ Year: year, Place: place, "Round 1 Award": place === 1 ? 200 : 160, "Round 3 Award": place === 1 ? 300 : 240 }));
  const payouts = [1, 2].map((place) => ({ Year: year, Place: place, "Round 1 Award %": place === 1 ? 10 : 8, "Round 3 Award %": place === 1 ? 12 : 9 }));
  const model = buildCalcuttaModel({ year, players, purchases, pointStructure: points, payoutStructure: payouts, roundResults });
  const first = model.golfers.find((golfer) => golfer.playerId === "P1");
  assert.equal(first.rounds[1].points, 200);
  assert.equal(first.rounds[3].points, 300);
});

test("published Round 2 rows preserve team placement and individual 50/50 shares on read-back", () => {
  const scores = scenarios["two teams tied for first"];
  const roundResults = scores.map((net, index) => ({
    Year: year,
    Round: 2,
    Format: "Scramble",
    "Player IDs": teamIds(index).join(","),
    "Gross Score": net + 5,
    "Net Score": net,
    "Full Course Handicap": 5,
  }));
  const published = calcuttaPublicationRecords({ year, players, purchases, pointStructure, payoutStructure, roundResults, updatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(published.roundResults.length, 24);
  assert.equal(published.standings.length, 24);

  const readBack = buildCalcuttaModel({ year, players, purchases, pointStructure, payoutStructure, roundResults: published.roundResults, standings: published.standings });
  const expectedFirstTeamAward = (teamPointAwards[0] + teamPointAwards[1]) / 2;
  const members = teamIds(0).map((id) => readBack.golfers.find((golfer) => golfer.playerId === id));
  assert.equal(members[0].rounds[2].points, expectedFirstTeamAward / 2);
  assert.equal(members[1].rounds[2].points, expectedFirstTeamAward / 2);
  assert.equal(members[0].rounds[2].points + members[1].rounds[2].points, expectedFirstTeamAward);
  assert.equal(members[0].rounds[2].place, 1);
  assert.equal(members[1].rounds[2].place, 1);
});
