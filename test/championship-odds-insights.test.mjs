import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publishedOddsInsights } from "../lib/championship-odds-insights.js";

const player = (id, name, probability, americanOdds) => ({ id, name, probability, americanOdds });

test("published odds insights returns the required empty state model without snapshots", () => {
  assert.deepEqual(publishedOddsInsights([]), { current: null, favorite: null, movers: null, players: [] });
});

test("published odds insights preserves supplied player order and ranking", () => {
  const current = { phase: "Round 2 Pairings", phaseOrder: 2, players: [
    player("clay", "Clay Beltran", 17, "+450"),
    player("david", "David Tatum", 14, "+610"),
  ] };
  const result = publishedOddsInsights([current]);
  assert.equal(result.current, current);
  assert.equal(result.favorite.name, "Clay Beltran");
  assert.deepEqual(result.players.map(({ name, rank }) => [name, rank]), [["Clay Beltran", 1], ["David Tatum", 2]]);
  assert.equal(result.movers, null);
});

test("biggest movers compare only consecutive published snapshots", () => {
  const previous = { phase: "Round 1 Pairings", phaseOrder: 1, players: [
    player("clay", "Clay Beltran", 12, "+700"),
    player("david", "David Tatum", 19, "+425"),
    player("jack", "Jack Samis", 9, "+1000"),
  ] };
  const current = { phase: "Round 2 Pairings", phaseOrder: 2, players: [
    player("clay", "Clay Beltran", 17, "+450"),
    player("david", "David Tatum", 13, "+650"),
    player("jack", "Jack Samis", 10, "+900"),
  ] };
  const result = publishedOddsInsights([current, previous]);
  assert.equal(result.movers.riser.name, "Clay Beltran");
  assert.equal(result.movers.riser.change, 5);
  assert.equal(result.movers.faller.name, "David Tatum");
  assert.equal(result.movers.faller.change, -6);
  assert.equal(result.players[0].previous.americanOdds, "+700");
});

test("Insights API reads published snapshots and never imports simulation logic", async () => {
  const [route, component] = await Promise.all([
    readFile(new URL("../app/api/leaderboards/insights/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /readOddsSnapshots/);
  assert.match(route, /Number\(snapshot\.year\) === year/);
  assert.doesNotMatch(`${route}\n${component}`, /simulateTournamentOdds|previewOddsSnapshot|americanOddsFromProbability/);
});
