import test from "node:test";
import assert from "node:assert/strict";
import { validateLiveMatchPairing } from "../lib/live-match-pairing.js";

const players = ["P1", "P2", "P3", "P4"];
const rosters = [
  { Year: 2026, "Team Side": "Team 1", "Player ID": "P1" },
  { Year: 2026, "Team Side": "Team 1", "Player ID": "P2" },
  { Year: 2026, "Team Side": "Team 2", "Player ID": "P3" },
  { Year: 2026, "Team Side": "Team 2", "Player ID": "P4" },
];

test("accepts a legal team-format pairing", () => {
  const result = validateLiveMatchPairing({
    match: { Year: 2026, Format: "BB", "Match Status": "Scheduled" },
    updates: {
      "Team 1 Player 1": "P1",
      "Team 1 Player 2": "P2",
      "Team 2 Player 1": "P3",
      "Team 2 Player 2": "P4",
    },
    playerIds: players,
    rosters,
  });
  assert.equal(result["Team 2 Player 2"], "P4");
});

test("singles clears unused second-player slots", () => {
  const result = validateLiveMatchPairing({
    match: { Year: 2026, Format: "SI", "Match Status": "Scheduled" },
    updates: {
      "Team 1 Player 1": "P1",
      "Team 1 Player 2": "P2",
      "Team 2 Player 1": "P3",
      "Team 2 Player 2": "P4",
    },
    playerIds: players,
    rosters,
  });
  assert.equal(result["Team 1 Player 2"], "");
  assert.equal(result["Team 2 Player 2"], "");
});

test("rejects duplicate, cross-team, and finalized pairing edits", () => {
  assert.throws(() => validateLiveMatchPairing({
    match: { Year: 2026, Format: "BB", "Match Status": "Scheduled" },
    updates: {
      "Team 1 Player 1": "P1",
      "Team 1 Player 2": "P1",
      "Team 2 Player 1": "P3",
      "Team 2 Player 2": "P4",
    },
    playerIds: players,
    rosters,
  }), /more than once/);

  assert.throws(() => validateLiveMatchPairing({
    match: { Year: 2026, Format: "SI", "Match Status": "Scheduled" },
    updates: { "Team 1 Player 1": "P3", "Team 2 Player 1": "P1" },
    playerIds: players,
    rosters,
  }), /not assigned/);

  assert.throws(() => validateLiveMatchPairing({
    match: { Year: 2026, Format: "SI", "Match Status": "Final" },
    updates: { "Team 1 Player 1": "P1", "Team 2 Player 1": "P3" },
    playerIds: players,
    rosters,
  }), /Reopen/);
});
