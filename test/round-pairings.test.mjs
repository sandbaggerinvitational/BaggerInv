import assert from "node:assert/strict";
import test from "node:test";

import { pairingSlotsForFormat, validateRoundPairings } from "../lib/round-pairings.js";

const roster = Array.from({ length: 24 }, (_, index) => ({
  id: `P${String(index + 1).padStart(2, "0")}`,
  name: `Player ${index + 1}`,
  side: index < 12 ? 1 : 2,
  year: 2026,
}));

function matchesFor(format) {
  const slots = pairingSlotsForFormat(format);
  const count = roster.length / (slots * 2);
  return Array.from({ length: count }, (_, matchIndex) => {
    const assignments = {};
    for (const side of [1, 2]) for (let slot = 1; slot <= slots; slot += 1) {
      const sideOffset = side === 1 ? 0 : 12;
      assignments[`Team ${side} Player ${slot}`] = roster[sideOffset + matchIndex * slots + slot - 1].id;
    }
    return { id: `2026-R1-${matchIndex + 1}`, match: matchIndex + 1, assignments };
  });
}

for (const [format, expectedMatches] of [["BB", 6], ["SC", 6], ["SI", 12]]) test(`${format} validates a complete active-year round`, () => {
  const result = validateRoundPairings({ year: 2026, round: 1, format, matches: matchesFor(format), players: roster });
  assert.equal(result.valid, true);
  assert.equal(result.assignedCount, 24);
  assert.equal(result.expectedMatchCount, expectedMatches);
});

test("round validation rejects duplicates, missing slots, historical golfers, and wrong-team assignments", () => {
  const matches = matchesFor("SI");
  matches[0].assignments["Team 1 Player 1"] = "P02";
  matches[1].assignments["Team 2 Player 1"] = "P01";
  matches[2].assignments["Team 1 Player 1"] = "HIST01";
  matches[3].assignments["Team 2 Player 1"] = "";
  const result = validateRoundPairings({ year: 2026, round: 3, format: "SI", matches, players: roster });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("assigned to Match 1 and Match 2")));
  assert.ok(result.errors.some((message) => message.includes("wrong team")));
  assert.ok(result.errors.some((message) => message.includes("not an active 2026")));
  assert.ok(result.errors.some((message) => message.includes("is unassigned")));
});

