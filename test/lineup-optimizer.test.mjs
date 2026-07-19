import test from "node:test";
import assert from "node:assert/strict";
import { distinctAlternative } from "../lib/lineup-optimizer.js";

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
