import test from "node:test";
import assert from "node:assert/strict";
import {
  playerProjectionSummary,
  projectionHistoryHighlights,
  publishedPlayerHistory,
  tournamentProjectionStory,
} from "../lib/projection-editorial.js";

const snapshot = (phase, players) => ({ phase, publishedAt: `${phase.length}`, players });
const player = (id, name, probability, americanOdds) => ({ id, name, probability, americanOdds });

test("tournament storyline uses only the current and previous published ordering", () => {
  const previous = snapshot("Pre-Tournament", [player("a", "Max Markley", 18, "+450"), player("b", "Clay Beltran", 12, "+700")]);
  const current = snapshot("Round 2 Pairings", [player("b", "Clay Beltran", 21, "+375"), player("a", "Max Markley", 15, "+550")]);
  assert.equal(tournamentProjectionStory({ current: previous }), "Max Markley opens as the tournament favorite heading into tournament weekend.");
  assert.equal(tournamentProjectionStory({ current, previous }), "Clay Beltran climbs from 2nd to the top of the latest Championship Projection.");
});

test("published player history preserves milestones and existing values", () => {
  const history = publishedPlayerHistory([
    snapshot("Pre-Tournament", [player("a", "Clay Beltran", 9, "+1200")]),
    snapshot("After Round 1", [player("a", "Clay Beltran", 15, "+650")]),
    snapshot("Round 3 Pairings Announced", [player("a", "Clay Beltran", 18, "+450")]),
  ], "a");
  assert.deepEqual(history.map(({ phase, probability, americanOdds }) => [phase, probability, americanOdds]), [
    ["Opening Championship Projection", 9, "+1200"], ["Round 2 Pairings Projection", 15, "+650"], ["Championship Singles Projection", 18, "+450"],
  ]);
  assert.equal(history.at(-1).current, true);
});

test("projection history highlights published extrema and adjacent movement", () => {
  const history = projectionHistoryHighlights([
    { phase: "Pre-Tournament", probability: 9, rank: 8 },
    { phase: "Round 2 Pairings", probability: 15, rank: 4 },
    { phase: "Round 3 Pairings", probability: 12, rank: 5, current: true },
  ]);
  assert.deepEqual(history[0].highlights, ["Lowest Projection"]);
  assert.deepEqual(history[1].highlights, ["Highest Projection", "Largest Positive Movement"]);
  assert.deepEqual(history[2].highlights, ["Largest Negative Movement", "Current"]);
});

test("player summary describes only supported published history patterns", () => {
  assert.equal(playerProjectionSummary("Clay Beltran", [{ rank: 3, probability: 12 }]), "This is the first published Championship Projection.");
  assert.equal(playerProjectionSummary("Clay Beltran", [{ rank: 3, probability: 12 }, { rank: 2, probability: 15 }, { rank: 1, probability: 18 }]), "Clay Beltran has improved in every published Championship Projection.");
  assert.equal(playerProjectionSummary("Max Markley", [{ rank: 1, probability: 20 }, { rank: 1, probability: 19 }]), "Max Markley has remained the tournament favorite since the opening projection.");
});
