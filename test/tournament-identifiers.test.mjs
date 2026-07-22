import test from "node:test";
import assert from "node:assert/strict";
import {
  assertValidTournamentId,
  resolveTournamentSelection,
  tournamentId,
  tournamentYear,
} from "../lib/tournament-identifiers.js";

test("a blank Year never becomes tournament 0", () => {
  const record = { Year: "", Annual: "10th Annual Sandbagger Invitational", Dates: "September 25 - 26, 2026" };
  assert.equal(tournamentYear(record), 2026);
  assert.equal(tournamentId(record), "2026");
  assert.throws(() => assertValidTournamentId("0"), /Unable to resolve/);
});

test("selector rejects invalid URL state and uses the configured current tournament", () => {
  const tournaments = [{ id: "2026" }, { id: "2025" }];
  assert.equal(resolveTournamentSelection(tournaments, "0"), "2026");
  assert.equal(resolveTournamentSelection(tournaments, "2025"), "2025");
});
