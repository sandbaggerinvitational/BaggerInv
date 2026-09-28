import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { benchmarkOperations, reusableScoreInput } from "./support/reliability/benchmark-operations.mjs";
import { binaries, postgresBin } from "./support/reliability/postgres17.mjs";
import { retainedIncidentCounts, supportedScaleFactors, targetCounts } from "./support/reliability/synthetic-history.mjs";
import { archivedYearCounts } from "./support/reliability/synthetic-archived-years.mjs";

test("reliability benchmark inventory is the requested 17 actual path set", () => {
  assert.equal(benchmarkOperations.length, 17);
  assert.equal(new Set(benchmarkOperations.map((value) => value.id)).size, 17);
  assert.deepEqual(benchmarkOperations.map((value) => value.label), [
    "canonical score write", "score canonical readback", "participant Today",
    "Matches", "Leaders", "Prepare match", "Open Round", "Lock Round",
    "Resume Round", "Finalize", "Net Skins participant read",
    "Net Skins calculation path", "Calcutta participant read",
    "Calcutta calculation path", "Odds participant read",
    "Odds calculation path", "Director readiness/current-state read",
  ]);
  assert.ok(benchmarkOperations.every((value) => /^ACTUAL_/.test(value.coverage)));
});

test("history profiles preserve the current tournament and add deterministic archived years", () => {
  assert.deepEqual(supportedScaleFactors, [1, 2, 5, 10]);
  for (const scale of supportedScaleFactors) {
    const counts = targetCounts(scale);
    for (const key of ["tournamentPlayers", "matches", "matchParticipants",
      "courseHoles", "matchHoles", "holeScores"]) {
      assert.equal(counts[key], retainedIncidentCounts[key]);
    }
    for (const [key, value] of Object.entries(retainedIncidentCounts)) {
      if (!["tournamentPlayers", "matches", "matchParticipants", "courseHoles",
        "matchHoles", "holeScores"].includes(key)) assert.equal(counts[key], value * scale);
    }
    assert.deepEqual(archivedYearCounts(scale), {
      archivedYears: scale, archivedPlayers: 24 * scale,
      archivedRounds: 3 * scale, archivedMatches: 24 * scale,
      archivedParticipants: 72 * scale, archivedMatchHoles: 432 * scale,
      archivedScores: 432 * scale,
    });
  }
});

test("score fixture is gross-only and contains no client-derived net fields", () => {
  assert.deepEqual(reusableScoreInput.team_1_gross_scores, [4]);
  assert.deepEqual(reusableScoreInput.team_2_gross_scores, [5]);
  for (const forbidden of ["team_1_net_score", "team_2_net_score", "team_1_strokes",
    "team_2_strokes", "hole_winner", "running_result"]) {
    assert.equal(Object.hasOwn(reusableScoreInput, forbidden), false, forbidden);
  }
});

test("PostgreSQL runner exposes local binaries only and no remote target option", () => {
  assert.ok(path.isAbsolute(postgresBin));
  for (const binary of Object.values(binaries)) {
    assert.equal(path.dirname(binary), postgresBin);
  }
  const helper = readFileSync(new URL("./support/reliability/postgres17.mjs", import.meta.url), "utf8");
  assert.match(helper, /-h", cluster\.socket/);
  assert.match(helper, /"DATABASE_URL"/);
  assert.doesNotMatch(helper, /createIsolatedCluster\([^)]*(?:host|url)/i);
});
