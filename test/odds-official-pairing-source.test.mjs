import test from "node:test";
import assert from "node:assert/strict";
import { bindOfficialProjectionMatches } from "../lib/odds-pairing-source.js";

test("current projections consume Director pairings from Live Matches", () => {
  const sheets = {
    liveTournaments: [{ Year: 2026 }],
    handicaps: [{ Year: 2026, "Player ID": "A", "Team Side": "Team 1" }],
    matches: [{ Year: 2025, "Match ID": "historic" }, { Year: 2026, "Match ID": "stale" }],
    liveMatches: [{ Year: 2026, "Match ID": "official" }],
  };
  const bound = bindOfficialProjectionMatches(sheets, 2026);
  assert.equal(bound.projectionMatchSource, "Live Matches");
  assert.deepEqual(bound.matches.map((row) => row["Match ID"]), ["historic", "official"]);
});

test("projection match binding safely falls back to Matches when Live Matches has no active-year rows", () => {
  const sheets = { liveTournaments: [{ Year: 2026 }], matches: [{ Year: 2026, "Match ID": "configured" }], liveMatches: [] };
  const bound = bindOfficialProjectionMatches(sheets, 2026);
  assert.equal(bound.projectionMatchSource, "Matches");
  assert.equal(bound.matches[0]["Match ID"], "configured");
});
