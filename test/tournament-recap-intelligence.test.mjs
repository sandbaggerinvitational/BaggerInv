import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTournamentRecapIntelligence } from "../lib/tournament-recap-intelligence.js";

const players = {
  opening: [
    { id: "a", name: "Clay Beltran", probability: 30, americanOdds: "+233", averageFinish: 1.4 },
    { id: "b", name: "Max Markley", probability: 20, americanOdds: "+400", averageFinish: 2.8 },
    { id: "c", name: "Jack Samis", probability: 8, americanOdds: "+1150", averageFinish: 3.7 },
  ],
  outlook: [
    { id: "b", name: "Max Markley", probability: 32, americanOdds: "+213" },
    { id: "a", name: "Clay Beltran", probability: 24, americanOdds: "+317" },
    { id: "c", name: "Jack Samis", probability: 15, americanOdds: "+567" },
  ],
  singles: [
    { id: "b", name: "Max Markley", probability: 36, americanOdds: "+178" },
    { id: "c", name: "Jack Samis", probability: 25, americanOdds: "+300" },
    { id: "a", name: "Clay Beltran", probability: 18, americanOdds: "+456" },
  ],
};

const snapshots = [
  { phase: "Pre-Tournament", phaseOrder: 1, publishedAt: "2026-09-24T12:00:00Z", players: players.opening, teams: [{ name: "The Pickles", probability: 38 }, { name: "Lipp It and Rip It", probability: 62 }] },
  { phase: "After Round 2", phaseOrder: 3, publishedAt: "2026-09-25T23:00:00Z", players: players.outlook, teams: [{ name: "The Pickles", probability: 62 }, { name: "Lipp It and Rip It", probability: 38 }] },
  { phase: "Round 3 Pairings Announced", phaseOrder: 4, publishedAt: "2026-09-26T01:00:00Z", players: players.singles, teams: [{ name: "The Pickles", probability: 49 }, { name: "Lipp It and Rip It", probability: 51 }] },
  { phase: "Final Results", phaseOrder: 5, publishedAt: "2026-09-26T22:00:00Z", players: players.singles, teams: [{ name: "The Pickles" }, { name: "Lipp It and Rip It" }] },
];

const tournament = {
  year: 2026,
  name: "Sandbagger Invitational",
  dates: "September 25–26, 2026",
  teamOne: { name: "The Pickles", score: 22.5 },
  teamTwo: { name: "Lipp It and Rip It", score: 13.5 },
};
const leaderboard = [
  { id: "b", player: "Max Markley", points: 8, wins: 3, losses: 0 },
  { id: "c", player: "Jack Samis", points: 6, wins: 2, losses: 1 },
  { id: "a", player: "Clay Beltran", points: 4, wins: 1, losses: 2 },
];

test("Final Results creates an official recap from snapshots and official results", () => {
  const recap = buildTournamentRecapIntelligence({ snapshots, tournament, leaderboard });
  assert.equal(recap.champion.champions[0].name, "The Pickles");
  assert.equal(recap.champion.finalScore, "22.5–13.5");
  assert.equal(recap.champion.winningMargin, 9);
  assert.equal(recap.mvp.name, "Max Markley");
  assert.match(recap.story, /38% Opening Championship Projection/);
  assert.match(recap.story, /Tournament MVP/);
});

test("projection accuracy and tournament-wide movement use published milestones only", () => {
  const recap = buildTournamentRecapIntelligence({ snapshots, tournament, leaderboard });
  assert.equal(recap.accuracy.openingFavorite.name, "Clay Beltran");
  assert.equal(recap.accuracy.openingFavorite.actualRank, 3);
  assert.equal(recap.accuracy.biggestSurprise.name, "Max Markley");
  assert.equal(recap.movers.largestRise.name, "Max Markley");
  assert.equal(recap.movers.largestProbabilityGain.name, "Jack Samis");
  assert.equal(recap.movers.largestProbabilityLoss.name, "Clay Beltran");
});

test("captain impact compares outlook with official Singles pairings", () => {
  const recap = buildTournamentRecapIntelligence({ snapshots, tournament, leaderboard });
  assert.deepEqual(recap.captainImpact.map(({ name, before, after, change }) => ({ name, before, after, change })), [
    { name: "The Pickles", before: 62, after: 49, change: -13 },
    { name: "Lipp It and Rip It", before: 38, after: 51, change: 13 },
  ]);
});

test("every player journey preserves published phases and appends actual finish", () => {
  const recap = buildTournamentRecapIntelligence({ snapshots, tournament, leaderboard });
  const max = recap.journeys.find((player) => player.id === "b");
  assert.deepEqual(max.milestones.map((item) => item.phase), ["Pre-Tournament", "After Round 2", "Round 3 Pairings Announced", "Final Results"]);
  assert.equal(max.rank, 1);
  assert.equal(recap.modelAccuracy.openingTeamFavorite.name, "Lipp It and Rip It");
  assert.equal(recap.modelAccuracy.openingTeamFinished, 2);
  assert.ok(recap.modelAccuracy.meanFinishError >= 0);
});

test("recap analytics remain unavailable until Final Results is published", () => {
  assert.equal(buildTournamentRecapIntelligence({ snapshots: snapshots.slice(0, -1), tournament, leaderboard }), null);
});

test("participant recap is a presentation layer and leaves engine and API contracts untouched", async () => {
  const [dashboard, intelligence] = await Promise.all([
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-recap-intelligence.js", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /TournamentRecapExperience/);
  assert.match(dashboard, /Projection Accuracy/);
  assert.match(dashboard, /Captain Impact/);
  assert.match(dashboard, /Model Accuracy/);
  assert.match(dashboard, /Projection Journey/);
  assert.doesNotMatch(intelligence, /simulateTournamentOdds|americanOddsFromProbability|fetch\(|googleapis/);
});
