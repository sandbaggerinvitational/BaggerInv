import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tournamentIntelligenceStorylines } from "../lib/tournament-intelligence-storylines.js";

const player = (id, name, probability) => ({ id, name, probability });
const snapshot = (phase, players) => ({ phase, players });

test("one published projection produces only the introductory storyline", () => {
  assert.deepEqual(tournamentIntelligenceStorylines({ snapshots: [snapshot("Pre-Tournament", [player("a", "Max Markley", 18)])] }), [{
    id: "projection-introduction",
    icon: "🏆",
    headline: "Championship Projections are published.",
    support: "Storylines will evolve as additional projections are released.",
  }]);
});

test("storylines explain supported favorite, rank rise, and team concentration", () => {
  const previous = snapshot("Pre-Tournament", [player("a", "Max Markley", 18), player("b", "Clay Beltran", 12), player("c", "Jack Samis", 10)]);
  const current = snapshot("Round 2 Pairings", [player("b", "Clay Beltran", 21), player("a", "Max Markley", 16), player("c", "Jack Samis", 11)]);
  const stories = tournamentIntelligenceStorylines({ snapshots: [previous, current], playerTeams: new Map([["a", "The Pickles"], ["b", "The Pickles"], ["c", "The Pickles"]]) });
  assert.equal(stories.length, 3);
  assert.equal(stories[0].id, "current-favorite");
  assert.match(stories[0].support, /2nd to the top spot/);
  assert.equal(stories[1].id, "biggest-rise");
  assert.match(stories[1].support, /2nd to 1st/);
  assert.equal(stories[2].id, "strongest-team");
  assert.match(stories[2].support, /3 players inside the current Top 10/);
});

test("a close top-two race appears only when supported by published probabilities", () => {
  const previous = snapshot("Pre-Tournament", [player("a", "Max Markley", 20), player("b", "Clay Beltran", 12)]);
  const current = snapshot("Round 2 Pairings", [player("a", "Max Markley", 18), player("b", "Clay Beltran", 16)]);
  const story = tournamentIntelligenceStorylines({ snapshots: [previous, current] }).find((item) => item.id === "closest-race");
  assert.match(story.support, /2 percentage points/);
});

test("Storylines is a separate section beneath the frozen projection publication block", async () => {
  const [dashboard, component] = await Promise.all([
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/TournamentIntelligenceStorylines.js", import.meta.url), "utf8"),
  ]);
  assert.ok(dashboard.indexOf("Publication Information") < dashboard.indexOf("<TournamentIntelligenceStorylines"));
  assert.match(component, />Storylines<\/h2>/);
  assert.match(component, /Why the latest published tournament data matters\./);
  assert.doesNotMatch(`${dashboard}\n${component}`, /simulateTournamentOdds|americanOddsFromProbability/);
});
