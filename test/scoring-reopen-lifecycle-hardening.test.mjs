import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateMatchPoints } from "../lib/live-hole-scoring.js";
import { isOfficialMatchResult } from "../lib/live-tournament.js";
import { assertGenericMatchUpdateHasNoLifecycle } from "../lib/scoring-lifecycle-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Final → Reopen → Correct → Re-finalize retains holes and versions permissions", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    winner: "Team 1",
    revision: 1,
  }));
  const finalPoints = calculateMatchPoints("BB", holes);
  let permissionRevision = 1;
  let matchRevision = 18;
  let match = { status: "Live", "Match Status": "Live", team1Points: null, team2Points: null,
    scoringLocked: false, canScore: true };

  permissionRevision += 1; matchRevision += 1;
  match = { ...match, status: "Final", "Match Status": "Final",
    team1Points: finalPoints.team1Points, team2Points: finalPoints.team2Points,
    scoringLocked: true, canScore: false, permissionRevision, matchRevision };
  assert.equal(isOfficialMatchResult(match), true);
  assert.deepEqual([match.team1Points, match.team2Points], [3, 0]);

  const retainedHoleCount = holes.length;
  permissionRevision += 1; matchRevision += 1;
  match = { ...match, status: "Reopened", "Match Status": "Reopened",
    scoringLocked: false, canScore: true, permissionRevision, matchRevision };
  assert.equal(isOfficialMatchResult(match), false, "reopen removes the prior result from official tournament aggregation");
  assert.equal(holes.length, retainedHoleCount, "reopen retains canonical hole facts");

  holes[0] = { ...holes[0], winner: "Team 2", revision: 2 };
  matchRevision += 1;
  const correctedPoints = calculateMatchPoints("BB", holes);
  assert.equal(holes[0].revision, 2);

  permissionRevision += 1; matchRevision += 1;
  match = { ...match, status: "Final", "Match Status": "Final",
    team1Points: correctedPoints.team1Points, team2Points: correctedPoints.team2Points,
    scoringLocked: true, canScore: false, permissionRevision, matchRevision };
  assert.equal(isOfficialMatchResult(match), true);
  assert.equal(match.team1Points + match.team2Points, 3);
  assert.equal(match.scoringLocked, true);
  assert.equal(match.canScore, false);
  assert.equal(permissionRevision, 4);
  assert.equal(matchRevision, 22);
});

test("generic lifecycle mutation fails with the dedicated-action contract", () => {
  assert.throws(() => assertGenericMatchUpdateHasNoLifecycle({ "Match Status": "Final" }), (error) =>
    error.code === "DEDICATED_LIFECYCLE_ACTION_REQUIRED" && /Finalize Match/.test(error.message));
  assert.doesNotThrow(() => assertGenericMatchUpdateHasNoLifecycle({ Notes: "Director note" }));
});

test("legacy normalization is Preview-only, audited, versioned, and leaves scoring authority unchanged", async () => {
  const migration = await source("supabase/migrations/202608200001_preview_legacy_reopen_normalization.sql");
  const route = await source("app/api/director/scoring-authority/route.js");
  const writer = await source("lib/google-sheets-write.js");
  assert.match(migration, /upper\(coalesce\(input->>'environment', ''\)\) <> 'PREVIEW'/i);
  assert.match(migration, /director_authorized/i);
  assert.match(migration, /operator_intent_confirmed/i);
  assert.match(migration, /score_revision_history/i);
  assert.match(migration, /audit_events/i);
  assert.match(migration, /google_match_checkpoints/i);
  assert.match(migration, /SCORING_PERMISSIONS_NOT_IMPORTED/i);
  assert.doesNotMatch(migration, /update scoring_authority\.ingress_gates set[\s\S]{0,100}authority/i);
  assert.match(route, /normalize-legacy-reopen/);
  assert.match(route, /beginScoringIngress/);
  assert.match(route, /completeScoringIngress/);
  assert.match(route, /normalizeLegacyReopenedMatch/);
  assert.match(route, /normalizeCanonicalLegacyReopen/);
  assert.doesNotMatch(route, /normalize-legacy-reopen[\s\S]{0,500}replaceCanonicalScoringAuthorityImport/);
  assert.match(writer, /holeScoresPreserved: true/);
  assert.match(writer, /Legacy Reopen Normalized/);
  assert.match(writer, /OFFICIAL_ARCHIVE_RESULT_FIELDS\.some/);
  assert.match(route, /ARCHIVE_INVALIDATION_FAILED/);
});
