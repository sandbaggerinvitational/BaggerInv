import assert from "node:assert/strict";
import test from "node:test";
import { playerRoundBreakdown } from "../lib/leaderboard-round-breakdown.js";

const tournament = { teamOne: { name: "The Pickles" }, teamTwo: { name: "Lipp it and Rip it" } };
const holes = (frontOne, backOne) => Array.from({ length: 18 }, (_, index) => ({
  holeNumber: index + 1,
  winner: index < 9 ? (index < frontOne ? "Team 1" : "Team 2") : (index - 9 < backOne ? "Team 1" : "Team 2"),
}));

test("completed Overall breakdown uses canonical segment and official result formatting", () => {
  const round = { matches: [{
    status: "Final", archiveFinal: true, finalResult: "The Pickles 2&1",
    team1Players: [{ id: "CB01" }], team2Players: [{ id: "AM01" }],
    holeResults: holes(5, 4),
  }] };
  const result = playerRoundBreakdown(round, "CB01", { points: 1.5 }, tournament);
  assert.equal(result.state, "final");
  assert.equal(result.label, "Final");
  assert.deepEqual(result.segments.map((segment) => segment.value), ["1 UP", "1 UP", "2 & 1"]);
  assert.equal(result.points, 1.5);
});

test("halved segments use participant-facing match language", () => {
  const round = { matches: [{
    status: "Final", archiveFinal: true, finalResult: "Halved",
    team1Players: [{ id: "CB01" }], team2Players: [{ id: "AM01" }],
    holeResults: holes(4, 4),
  }] };
  const result = playerRoundBreakdown(round, "CB01", { points: 0.75 }, tournament);
  assert.deepEqual(result.segments.map((segment) => segment.value), ["1 UP", "1 UP", "Halved"]);
});

test("unplayed rounds are Pending and never imply a zero record or points", () => {
  const result = playerRoundBreakdown({ matches: [] }, "CB01", null, tournament);
  assert.deepEqual(result, { state: "pending", label: "Pending", segments: [], points: null });
});

test("live rounds expose LIVE without assigning official points", () => {
  const result = playerRoundBreakdown({ matches: [{ status: "Live", team1Players: [{ id: "CB01" }], holeResults: [] }] }, "CB01", null, tournament);
  assert.equal(result.label, "LIVE");
  assert.equal(result.points, null);
});
