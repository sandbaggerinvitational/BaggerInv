import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGhostMatchExclusionSet,
  isPlayerExcludedFromMatchRecord,
  playerMatchEligibility,
  validateGhostMatchRows,
} from "../lib/ghost-match.js";
import { isOfficialMatchResult } from "../lib/live-tournament.js";

const players = [
  { "Player ID": "P1" },
  { "Player ID": "P2" },
  { "Player ID": "P3" },
  { "Player ID": "P4" },
];

const ghostMatch = {
  "Match ID": "2025-R1-1",
  "Match Status": "Ghost Match",
  "Team 1 Player 1": "P1",
  "Team 1 Player 2": "P2",
  "Team 2 Player 1": "P3",
  "Team 2 Player 2": "P4",
};

test("normal matches keep every player eligible", () => {
  const exclusions = buildGhostMatchExclusionSet([]);
  assert.equal(isPlayerExcludedFromMatchRecord("M1", "P1", exclusions), false);
  assert.deepEqual(playerMatchEligibility("M1", "P1", exclusions), {
    includeOfficialRecord: true,
    includeScorecardAnalytics: true,
  });
});

test("one or two exclusions are player-specific and never remove the scorecard", () => {
  const exclusions = buildGhostMatchExclusionSet([
    { "Match ID": "2025-R1-1", "Player ID": "P1" },
    { "Match ID": "2025-R1-1", "Player ID": "P2" },
  ]);
  assert.equal(isPlayerExcludedFromMatchRecord("2025-R1-1", "P1", exclusions), true);
  assert.equal(isPlayerExcludedFromMatchRecord("2025-R1-1", "P2", exclusions), true);
  assert.equal(isPlayerExcludedFromMatchRecord("2025-R1-1", "P3", exclusions), false);
  assert.deepEqual(playerMatchEligibility("2025-R1-1", "P1", exclusions), {
    includeOfficialRecord: false,
    includeScorecardAnalytics: true,
  });
});

test("Ghost Match status keeps the match and team points official", () => {
  assert.equal(isOfficialMatchResult({
    "Match Status": "Ghost Match",
    "Team 1 Points": 2,
    "Team 2 Points": 1,
    "Points Available": 3,
  }), true);
});

test("validation reports invalid references, status mismatches, and duplicates", () => {
  const warnings = validateGhostMatchRows({
    players,
    matches: [
      ghostMatch,
      { ...ghostMatch, "Match ID": "M2", "Match Status": "Final" },
      { ...ghostMatch, "Match ID": "M3", "Match Status": "Ghost Match" },
    ],
    rows: [
      { "Match ID": "2025-R1-1", "Player ID": "P1" },
      { "Match ID": "2025-R1-1", "Player ID": "P1" },
      { "Match ID": "2025-R1-1", "Player ID": "UNKNOWN" },
      { "Match ID": "M2", "Player ID": "P1" },
      { "Match ID": "UNKNOWN", "Player ID": "P1" },
    ],
  });
  const codes = new Set(warnings.map((warning) => warning.code));
  assert.ok(codes.has("Duplicate Ghost Match Exclusion"));
  assert.ok(codes.has("Unknown Ghost Match Player ID"));
  assert.ok(codes.has("Ghost Exclusion Without Ghost Match Status"));
  assert.ok(codes.has("Unknown Ghost Match ID"));
  assert.ok(codes.has("Ghost Match Status Without Exclusions"));
});
