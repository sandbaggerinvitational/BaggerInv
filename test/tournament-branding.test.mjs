import assert from "node:assert/strict";
import test from "node:test";
import { formatTournamentEdition } from "../lib/tournament-branding.js";

test("tournament edition normalizes supported workbook labels", () => {
  assert.equal(formatTournamentEdition("10th"), "10th Annual");
  assert.equal(formatTournamentEdition("10th Annual"), "10th Annual");
  assert.equal(formatTournamentEdition("10th Annual Sandbagger Invitational"), "10th Annual");
});

test("tournament edition remains absent when the workbook value is absent", () => {
  assert.equal(formatTournamentEdition(""), "");
  assert.equal(formatTournamentEdition(null), "");
});
