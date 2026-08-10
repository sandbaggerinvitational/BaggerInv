import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";
import { scoringShadowEnvironment } from "../lib/scoring-shadow-gate.js";
import {
  benchmarkSummary,
  buildScoringShadowObservation,
  deliverScoringShadowObservation,
  scoringShadowPayloadHash,
} from "../lib/scoring-shadow.js";
import { reconcileScoringShadowRecords, scoringShadowObservationsFromWorkbook } from "../lib/scoring-shadow-reconciliation.js";

const allowed = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  GOOGLE_SHEETS_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SUPABASE_SCORING_MIRROR_URL: "https://shadow.example.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret-for-test",
};

test("Phase 1 mirror requires flag, Preview/development, isolated workbook, and server credentials", () => {
  assert.equal(scoringShadowEnvironment(allowed).enabled, true);
  assert.equal(scoringShadowEnvironment({ ...allowed, SUPABASE_SCORING_MIRROR_ENABLED: "false" }).reason, "flag-disabled");
  assert.equal(scoringShadowEnvironment({ ...allowed, VERCEL_ENV: "production" }).reason, "deployment-blocked");
  assert.equal(scoringShadowEnvironment({ ...allowed, GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).reason, "workbook-blocked");
  assert.equal(scoringShadowEnvironment({ ...allowed, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).reason, "credentials-missing");
});

test("disabled mirror does not perform a network request", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not run"); };
  try {
    const result = await deliverScoringShadowObservation({}, { env: { ...allowed, SUPABASE_SCORING_MIRROR_ENABLED: "false" } });
    assert.deepEqual(result, { skipped: true, reason: "flag-disabled", totalDurationMs: result.totalDurationMs });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("verified observation preserves native scores, stable hashes, revisions, and shared calculations", () => {
  const match = { "Match ID": "R3-M9", Year: 2026, Round: 3, Format: "SI", "Match Status": "Live" };
  const hole = {
    "Hole Score ID": "R3-M9-H8", "Match ID": "R3-M9", "Hole Number": 8, "Stroke Index": 5,
    Format: "SI", "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5,
    "Team 1 Net Score": 3, "Team 2 Net Score": 5, "Hole Winner": "Team 1",
    Revision: 2, "Updated At": "2026-08-10T12:00:00.000Z", "Updated By": "Golfer",
  };
  const calculated = {
    holeNumber: 8, strokeIndex: 5, format: "SI",
    team1: { netScore: 3, grossScores: [{ grossScore: 4, strokes: 1, netScore: 3 }] },
    team2: { netScore: 5, grossScores: [{ grossScore: 5, strokes: 0, netScore: 5 }] },
    winner: "Team 1",
  };
  const observation = buildScoringShadowObservation({
    sourceWorkbookId: "preview-workbook", tournamentId: "2026", tournamentYear: 2026,
    match, hole, calculated, allHoleResults: [{ holeNumber: 8, winner: "Team 1" }], mutationKey: "mutation-1",
  });
  assert.deepEqual(observation.team_1_gross_scores, [4]);
  assert.deepEqual(observation.team_1_strokes, [1]);
  assert.equal(observation.google_revision, 2);
  assert.equal(observation.comparison_status, "PASS");
  assert.match(observation.payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(observation.payload_hash, scoringShadowPayloadHash(observation.canonical_payload));
});

test("shadow comparison records deterministic divergence without affecting authoritative values", () => {
  const observation = buildScoringShadowObservation({
    sourceWorkbookId: "preview", tournamentId: "2026", tournamentYear: 2026,
    match: { "Match ID": "M1", Year: 2026, Round: 1, Format: "BB", "Match Status": "Live" },
    hole: { "Match ID": "M1", "Hole Number": 1, "Stroke Index": 1, Format: "BB", "Team 1 Gross Scores": "[4,5]", "Team 2 Gross Scores": "[4,4]", "Team 1 Net Score": 3, "Team 2 Net Score": 4, "Hole Winner": "Team 1", Revision: 1, "Updated At": "2026-08-10T00:00:00Z" },
    calculated: { holeNumber: 1, strokeIndex: 1, format: "BB", team1: { netScore: 4, grossScores: [] }, team2: { netScore: 4, grossScores: [] }, winner: "Halved" },
    allHoleResults: [{ holeNumber: 1, winner: "Team 1" }], mutationKey: "m",
  });
  assert.equal(observation.comparison_status, "DIVERGENCE");
  assert.deepEqual(Object.keys(observation.comparison_diagnostics).sort(), ["hole_winner", "team_1_net_score"]);
  assert.equal(observation.google_result.team_1_net_score, 3);
});

test("reconciliation detects missing, payload, revision, stale, orphan, and duplicate observations", () => {
  const google = [{ "Tournament ID": "2026", Year: 2026, Round: 3, Format: "SI", "Match ID": "M1", "Hole Number": 1, "Stroke Index": 1, "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1", Revision: 2, "Updated At": "2026-08-10T12:00:00Z" }];
  const report = reconcileScoringShadowRecords(google, [
    { match_id: "M1", hole_number: 1, google_revision: 1, payload_hash: "bad", mirrored_at: "2026-08-10T11:00:00Z" },
    { match_id: "M1", hole_number: 1, google_revision: 1, payload_hash: "bad", mirrored_at: "2026-08-10T11:00:00Z" },
    { match_id: "ORPHAN", hole_number: 2, google_revision: 1, payload_hash: "bad", mirrored_at: "2026-08-10T11:00:00Z" },
  ]);
  assert.equal(report.duplicates, 1);
  assert.deepEqual(report.payloadDivergence, ["M1:1"]);
  assert.deepEqual(report.revisionMismatch, ["M1:1"]);
  assert.deepEqual(report.stale, ["M1:1"]);
  assert.deepEqual(report.orphan, ["ORPHAN:2"]);
  assert.equal(report.pass, false);
});

test("workbook rebuild observations retain correction revisions and one logical current key", () => {
  const matches = [{ "Match ID": "M1", "Tournament ID": "T2026", Year: 2026, Round: 3, Format: "SI", "Match Status": "Live" }];
  const holes = [{ "Hole Score ID": "M1-H1", "Match ID": "M1", "Hole Number": 1, "Stroke Index": 1, Format: "SI", "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1", Revision: 3, "Updated At": "2026-08-10T12:00:00Z" }];
  const rows = scoringShadowObservationsFromWorkbook({ sourceWorkbookId: "preview", matches, holes });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mutation_key, "rebuild:M1:H1:R3");
  assert.equal(rows[0].tournament_id, "T2026");
});

test("benchmark reporting includes percentiles and correctness counters", () => {
  assert.deepEqual(benchmarkSummary([1, 2, 3, 100], { errors: 1, retries: 2, duplicates: 3, lost: 4 }), {
    count: 4, min: 1, p50: 2, p95: 100, p99: 100, max: 100,
    errorCount: 1, retryCount: 2, duplicateCount: 3, lostLogicalScoreCount: 4,
  });
});

test("Phase 1 has no participant Supabase reads, auth, realtime, or Google mirror-back", async () => {
  const [route, legacyRoute, scorePage, scoreEntry, migration, serviceAccessMigration, envExample] = await Promise.all([
    readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608100001_preview_scoring_shadow.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608100002_preview_scoring_shadow_service_access.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  for (const scoringRoute of [route, legacyRoute]) {
    assert.match(scoringRoute, /after\(async \(\) =>/);
    assert.match(scoringRoute, /const \{ _shadow, \.\.\.participantResult \} = result/);
  }
  assert.doesNotMatch(`${scorePage}\n${scoreEntry}`, /supabase|hole_score_mirror|live_match_mirror/i);
  assert.doesNotMatch(`${scorePage}\n${scoreEntry}`, /realtime|createClient\(/i);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all .* from anon, authenticated/g);
  assert.match(serviceAccessMigration, /grant select on table public\.score_mirror_events to service_role/);
  assert.match(serviceAccessMigration, /grant select, insert on table public\.mirror_reconciliation_runs to service_role/);
  assert.doesNotMatch(serviceAccessMigration, /grant (?:update|delete|all).*service_role/i);
  assert.match(serviceAccessMigration, /revoke all .* from anon, authenticated/g);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(route, /Live Hole Scores.*(?:write|update)|SUPABASE.*GOOGLE/i);
});
