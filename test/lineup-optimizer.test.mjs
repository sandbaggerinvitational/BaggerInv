import test from "node:test";
import assert from "node:assert/strict";
import { distinctAlternative, optimizeLineups } from "../lib/lineup-optimizer.js";

test("alternative lineup does not reuse players from the best lineup", () => {
  const rows = [
    { team1Players: [{ id: "a" }, { id: "b" }] },
    { team1Players: [{ id: "a" }, { id: "c" }] },
    { team1Players: [{ id: "c" }, { id: "d" }] },
  ];
  assert.equal(distinctAlternative(rows, "A"), rows[2]);
});

test("alternative lineup returns null when every option reuses a player", () => {
  const rows = [
    { team2Players: [{ id: "a" }, { id: "b" }] },
    { team2Players: [{ id: "a" }, { id: "c" }] },
  ];
  assert.equal(distinctAlternative(rows, "B"), null);
});

test("optimizer aggregates every opposing pairing into one row per selected pairing", () => {
  const players = (prefix) => [1, 2, 3].map((number) => ({ id: `${prefix}${number}`, name: `${prefix} ${number}`, tournamentHandicap: 10 + number }));
  const result = optimizeLineups({
    format: "BB",
    team1: { name: "Pickles", players: players("A") },
    team2: { name: "Lipp", players: players("B") },
    scorecard: { rating: 72, slope: 113, par: 72 },
    historical: {}, partnerships: {}, headToHead: {}, settings: {},
  });
  assert.equal(result.matchupCount, 9);
  assert.equal(result.team1Pairings.length, 3);
  assert.equal(result.team1Pairings[0].opponentCount, 3);
  assert.equal(result.team1Pairings[0].matchups.length, 3);
  assert.ok(Number.isFinite(result.team1Pairings[0].averageExpectedPoints));
  assert.ok(Number.isFinite(result.team1Pairings[0].worstCaseWinProbability));
});
