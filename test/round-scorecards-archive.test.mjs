import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ROUND_SCORECARDS_ARCHIVE_SOURCE,
  ROUND_SCORECARDS_COMPLETE_STATUS,
  ROUND_SCORECARDS_REOPENED_STATUS,
  buildRoundScorecardsArchiveRows,
  planRoundScorecardsArchiveUpsert,
  roundScorecardFormula,
  roundScorecardLogicalIdentity,
  roundScorecardsArchiveEnvironment,
  verifyRoundScorecardsArchiveReadback,
} from "../lib/round-scorecards-archive.js";
import { processNextScorecardArchiveJob, reconcileRoundScorecardsArchives, scorecardArchiveFailureCode } from "../lib/scorecard-archive-worker.js";

const previewEnv = {
  VERCEL_ENV: "preview",
  ROUND_SCORECARDS_ARCHIVE_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
  GOOGLE_SHEETS_ID: "preview-sheet",
  PREVIEW_SCORING_SHEET_ID: "preview-sheet",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only",
};

function snapshot({ format = "SI", matchId = "2026-R3-4", round = 3, matchNumber = 4, participants, holes } = {}) {
  const defaultParticipants = format === "SI" ? [
    { player_id: "HM01", team_side: 1, player_slot: 1 },
    { player_id: "MS01", team_side: 2, player_slot: 1 },
  ] : [
    { player_id: "P1", team_side: 1, player_slot: 1 },
    { player_id: "P2", team_side: 1, player_slot: 2 },
    { player_id: "P3", team_side: 2, player_slot: 1 },
    { player_id: "P4", team_side: 2, player_slot: 2 },
  ];
  const defaultHoles = Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    team_1_gross_scores: format === "BB" ? [4 + index % 3, 5 + index % 2] : [4 + index % 3],
    team_2_gross_scores: format === "BB" ? [5 + index % 2, 4 + index % 3] : [5 + index % 2],
  }));
  return {
    snapshot_id: "00000000-0000-0000-0000-000000000100",
    snapshot_revision: 1,
    match_revision: 20,
    source_fingerprint: "a".repeat(64),
    payload_hash: "b".repeat(64),
    payload: {
      tournament: { tournament_id: "2026", year: 2026, name: "Sandbagger Invitational" },
      round: { round_number: round, format, name: `Round ${round}` },
      match: { match_id: matchId, display_number: String(matchNumber), format, status: "FINAL", match_revision: 20 },
      course: { course_id: round === 3 ? "OCGC01" : round === 2 ? "CPGC01" : "TPGC01" },
      teams: [
        { team_id: "PICKLES", team_side: 1, name: "The Pickles" },
        { team_id: "LIPPIT", team_side: 2, name: "Lipp it and Rip it" },
      ],
      participants: participants || defaultParticipants,
      holes: holes || defaultHoles,
    },
  };
}

test("Singles payload uses the exact 2026-R3-4 authoritative identities and gross values", () => {
  const holman = [4,5,5,3,5,4,5,3,3,4,5,3,4,3,4,5,3,5];
  const memo = [3,5,5,3,5,4,5,2,4,3,5,4,4,2,4,5,3,5];
  const rows = buildRoundScorecardsArchiveRows(snapshot({ holes: holman.map((score, index) => ({
    hole_number: index + 1, team_1_gross_scores: [score], team_2_gross_scores: [memo[index]],
  })) }));
  assert.equal(rows.length, 2);
  const hm = rows.find((row) => row["Player ID"] === "HM01");
  const ms = rows.find((row) => row["Player ID"] === "MS01");
  assert.equal(hm["Team ID"], "PICKLES");
  assert.equal(ms["Team ID"], "LIPPIT");
  assert.deepEqual(Array.from({ length: 18 }, (_, index) => hm[`Hole ${index + 1}`]), holman);
  assert.deepEqual(Array.from({ length: 18 }, (_, index) => ms[`Hole ${index + 1}`]), memo);
  assert.equal(hm["Score Type"], "Individual");
});

test("Scramble payload creates only two Team rows with intentionally blank Player IDs", () => {
  const rows = buildRoundScorecardsArchiveRows(snapshot({ format: "SC", matchId: "2026-R2-1", round: 2, matchNumber: 1 }));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row["Player ID"]), ["", ""]);
  assert.deepEqual(rows.map((row) => row["Team ID"]).sort(), ["LIPPIT", "PICKLES"]);
  assert.ok(rows.every((row) => row["Score Type"] === "Team"));
  assert.ok(rows.every((row) => Object.keys(row).filter((key) => key.startsWith("Hole ")).length === 18));
});

test("Best Ball payload creates four stable Player identities and preserves corrected gross values", () => {
  const jack = [5,4,5,4,5,4,5,4,4,5,4,5,4,5,4,5,4,4];
  assert.equal(jack.reduce((sum, value) => sum + value, 0), 80);
  const holes = Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    team_1_gross_scores: [4 + index % 2, jack[index]],
    team_2_gross_scores: [4 + index % 3, 5 - index % 2],
  }));
  const rows = buildRoundScorecardsArchiveRows(snapshot({
    format: "BB", matchId: "2026-R1-6", round: 1, matchNumber: 6, holes,
    participants: [
      { player_id: "HM01", team_side: 1, player_slot: 1 },
      { player_id: "JK01", team_side: 1, player_slot: 2 },
      { player_id: "MM01", team_side: 2, player_slot: 1 },
      { player_id: "MS01", team_side: 2, player_slot: 2 },
    ],
  }));
  assert.equal(rows.length, 4);
  const jackRow = rows.find((row) => row["Player ID"] === "JK01");
  assert.equal(Array.from({ length: 18 }, (_, index) => jackRow[`Hole ${index + 1}`]).reduce((sum, value) => sum + value, 0), 80);
  assert.equal(jackRow["Team ID"], "PICKLES");
});

test("archive provenance, Notes, status, and logical identities are deterministic", () => {
  const rows = buildRoundScorecardsArchiveRows(snapshot());
  assert.ok(rows.every((row) => row.Source === ROUND_SCORECARDS_ARCHIVE_SOURCE));
  assert.ok(rows.every((row) => row.Notes === ""));
  assert.ok(rows.every((row) => row["Scorecard Status"] === ROUND_SCORECARDS_COMPLETE_STATUS));
  assert.deepEqual(rows.map(roundScorecardLogicalIdentity), ["2026-R3-4:PLAYER:HM01", "2026-R3-4:PLAYER:MS01"]);
  const invalid = buildRoundScorecardsArchiveRows(snapshot(), { status: ROUND_SCORECARDS_REOPENED_STATUS });
  assert.ok(invalid.every((row) => row["Scorecard Status"] === "Missing"));
});

test("formula provisioning uses the protected canonical Match ID formula", () => {
  assert.equal(roundScorecardFormula(182), '=CONCATENATE(B182,"-R",C182,"-",D182)');
  assert.throws(() => roundScorecardFormula(1), /data-row/);
});

test("logical upsert reuses stable identities and clears duplicate/obsolete physical rows", () => {
  const expectedRows = buildRoundScorecardsArchiveRows(snapshot());
  const existingRows = [
    { rowNumber: 182, formula: roundScorecardFormula(182), record: expectedRows[0] },
    { rowNumber: 183, formula: roundScorecardFormula(183), record: expectedRows[0] },
  ];
  const availableRows = [{ rowNumber: 184, formula: "", record: {}, writableBlank: true }];
  const plan = planRoundScorecardsArchiveUpsert({ expectedRows, existingRows, availableRows });
  assert.deepEqual(plan.assignments.map((row) => row.rowNumber), [182, 183]);
  assert.deepEqual(plan.clearRows, []);
  assert.equal(new Set(plan.assignments.map((row) => row.identity)).size, 2);
});

test("fresh readback requires formulas, all fields, exact row count, and no duplicate identity", () => {
  const expectedRows = buildRoundScorecardsArchiveRows(snapshot());
  const actualRows = expectedRows.map((record, index) => ({ rowNumber: 182 + index, record, formula: roundScorecardFormula(182 + index) }));
  const formulas = Object.fromEntries(actualRows.map((row) => [row.rowNumber, row.formula]));
  assert.equal(verifyRoundScorecardsArchiveReadback({ expectedRows, actualRows, expectedFormulas: formulas }).pass, true);
  const bad = actualRows.map((row) => ({ ...row, record: { ...row.record } }));
  bad[0].record["Hole 8"] = 20;
  const report = verifyRoundScorecardsArchiveReadback({ expectedRows, actualRows: bad, expectedFormulas: formulas });
  assert.equal(report.pass, false);
  assert.equal(report.mismatches[0].field, "Hole 8");
  const unexpected = { ...actualRows[0], record: { ...actualRows[0].record, "Player ID": "OTHER" } };
  const unexpectedReport = verifyRoundScorecardsArchiveReadback({ expectedRows, actualRows: [...actualRows, unexpected], expectedFormulas: formulas });
  assert.equal(unexpectedReport.pass, false);
  assert.deepEqual(unexpectedReport.unexpected, ["2026-R3-4:PLAYER:OTHER"]);
});

test("archive feature flag is Preview/Supabase-only and Production-hard-blocked", () => {
  assert.equal(roundScorecardsArchiveEnvironment(previewEnv).enabled, true);
  const production = roundScorecardsArchiveEnvironment({ ...previewEnv, VERCEL_ENV: "production" });
  assert.equal(production.enabled, false);
  assert.equal(production.productionBlocked, true);
  assert.equal(roundScorecardsArchiveEnvironment({ ...previewEnv, ROUND_SCORECARDS_ARCHIVE_ENABLED: "false" }).enabled, false);
});

test("archive writer failures expose only fixed diagnostic classifications", () => {
  assert.equal(scorecardArchiveFailureCode(new Error("Google Sheets write credentials are not configured.")), "GOOGLE_SHEETS_CREDENTIALS_MISSING");
  assert.equal(scorecardArchiveFailureCode(new Error("Google Sheets request failed (403): private provider detail")), "GOOGLE_SHEETS_HTTP_403");
  assert.equal(scorecardArchiveFailureCode(new Error("Round Scorecards columns are not in the canonical protected order.")), "ROUND_SCORECARDS_SCHEMA_MISMATCH");
  assert.equal(scorecardArchiveFailureCode(new Error("unexpected internal detail")), "ARCHIVE_DELIVERY_FAILED");
});

function claimedJob(eventType = "SCORECARD_ARCHIVE_UPSERT") {
  return {
    id: "00000000-0000-0000-0000-000000000200",
    claim_token: "00000000-0000-0000-0000-000000000201",
    event_type: eventType,
    match_id: "2026-R3-4",
    match_revision: 20,
    snapshot_revision: 1,
    source_fingerprint: "a".repeat(64),
    archive_payload_hash: "b".repeat(64),
    attempts: 1,
  };
}

test("worker writes, freshly verifies, and checkpoints one claimed archive job", async () => {
  const completions = [];
  const result = await processNextScorecardArchiveJob({ env: previewEnv, dependencies: {
    claimScorecardArchiveJob: async () => ({ payload: { job: claimedJob(), snapshot: snapshot() } }),
    upsertRoundScorecardsArchive: async () => ({ pass: true, expectedIdentities: ["2026-R3-4:PLAYER:HM01", "2026-R3-4:PLAYER:MS01"], readbackHash: "c".repeat(64), actualRowCount: 2, rows: [{ rowNumber: 182 }, { rowNumber: 183 }] }),
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: { workbookWrites: 1 } }),
    completeScorecardArchiveJob: async (input) => { completions.push(input); return { payload: { ok: true, checkpoint: { status: "VERIFIED" } } }; },
    failScorecardArchiveJob: async () => assert.fail("success must not fail"),
  } });
  assert.equal(result.ok, true);
  assert.equal(result.rowCount, 2);
  assert.equal(completions[0].verified_status, "VERIFIED");
  assert.deepEqual(completions[0].google_row_numbers, [182, 183]);
});

test("Reopen job uses invalidation writer and checkpoints INVALIDATED", async () => {
  let usedInvalidation = false;
  const result = await processNextScorecardArchiveJob({ env: previewEnv, dependencies: {
    claimScorecardArchiveJob: async () => ({ payload: { job: claimedJob("SCORECARD_ARCHIVE_INVALIDATE"), snapshot: snapshot() } }),
    invalidateRoundScorecardsArchive: async () => { usedInvalidation = true; return { pass: true, expectedIdentities: [], readbackHash: "d".repeat(64), actualRowCount: 2, rows: [] }; },
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: {} }),
    completeScorecardArchiveJob: async (input) => ({ payload: { ok: input.verified_status === "INVALIDATED", checkpoint: { status: "INVALIDATED" } } }),
    failScorecardArchiveJob: async () => assert.fail("success must not fail"),
  } });
  assert.equal(result.ok, true);
  assert.equal(usedInvalidation, true);
});

for (const [label, error] of [
  ["429", Object.assign(new Error("rate limited"), { status: 429 })],
  ["503", Object.assign(new Error("unavailable"), { status: 503 })],
  ["timeout", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })],
]) test(`archive ${label} failure remains retryable and never checkpoints`, async () => {
  const failures = [];
  let completed = 0;
  const result = await processNextScorecardArchiveJob({ env: previewEnv, dependencies: {
    claimScorecardArchiveJob: async () => ({ payload: { job: claimedJob(), snapshot: snapshot() } }),
    upsertRoundScorecardsArchive: async () => { throw error; },
    failScorecardArchiveJob: async (input) => failures.push(input),
    completeScorecardArchiveJob: async () => { completed += 1; },
  } });
  assert.equal(result.ok, false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].block, false);
  assert.equal(completed, 0);
});

test("readback mismatch and stale/newest-wins checkpoint failures remain durable", async () => {
  const failures = [];
  const mismatch = await processNextScorecardArchiveJob({ env: previewEnv, dependencies: {
    claimScorecardArchiveJob: async () => ({ payload: { job: claimedJob(), snapshot: snapshot() } }),
    upsertRoundScorecardsArchive: async () => ({ pass: false }),
    failScorecardArchiveJob: async (input) => failures.push(input),
  } });
  assert.equal(mismatch.errorCode, "ARCHIVE_READBACK_MISMATCH");
  const stale = await processNextScorecardArchiveJob({ env: previewEnv, dependencies: {
    claimScorecardArchiveJob: async () => ({ payload: { job: claimedJob(), snapshot: snapshot() } }),
    upsertRoundScorecardsArchive: async () => ({ pass: true, expectedIdentities: [], readbackHash: "f".repeat(64), actualRowCount: 0, rows: [] }),
    completeScorecardArchiveJob: async () => ({ payload: { ok: false, code: "ARCHIVE_STALE_WORKER_REQUEUED" } }),
    failScorecardArchiveJob: async (input) => failures.push(input),
  } });
  assert.equal(stale.errorCode, "ARCHIVE_STALE_WORKER_REQUEUED");
  assert.ok(failures.length >= 2);
});

test("service reconciliation proves formulas, values, checkpoints, and evidence cases from fresh state", async () => {
  const canonical = { ...snapshot(), state: "CURRENT" };
  const expectedRows = buildRoundScorecardsArchiveRows(canonical);
  const physicalRows = expectedRows.map((record, index) => ({
    rowNumber: index + 2,
    formula: roundScorecardFormula(index + 2),
    record,
    writableBlank: false,
  }));
  const report = await reconcileRoundScorecardsArchives({ env: previewEnv, evidenceMatchIds: ["2026-R3-4"], dependencies: {
    inspectScorecardArchiveState: async () => ({ payload: {
      snapshots: [canonical],
      jobs: [{ status: "VERIFIED" }],
      checkpoints: [{ current_snapshot_id: canonical.snapshot_id, status: "VERIFIED" }],
    } }),
    inspectRoundScorecardsArchiveReadback: async () => ({ rows: physicalRows }),
  } });
  assert.equal(report.ok, true);
  assert.equal(report.expectedLogicalRows, 2);
  assert.equal(report.actualHoleValues, 36);
  assert.equal(report.evidence["2026-R3-4"].pass, true);
});

test("migration provides snapshots, jobs, checkpoints, trigger, RLS, service-only RPCs, backfill gate, and scheduled drain", async () => {
  const schema = await readFile(new URL("../supabase/migrations/202608130001_preview_round_scorecards_archive.sql", import.meta.url), "utf8");
  const drain = await readFile(new URL("../supabase/migrations/202608130002_preview_round_scorecards_archive_drain.sql", import.meta.url), "utf8");
  const fixture = await readFile(new URL("../supabase/migrations/202608130003_preview_round_scorecards_archive_fixture_test.sql", import.meta.url), "utf8");
  const fixtureYear = await readFile(new URL("../supabase/migrations/202608130004_preview_round_scorecards_archive_fixture_year.sql", import.meta.url), "utf8");
  const fixtureCleanup = await readFile(new URL("../supabase/migrations/202608130005_preview_round_scorecards_archive_fixture_cleanup.sql", import.meta.url), "utf8");
  const protectedDrain = await readFile(new URL("../supabase/migrations/202608130006_preview_round_scorecards_archive_protected_drain.sql", import.meta.url), "utf8");
  for (const table of ["finalized_scorecard_snapshots", "scorecard_archive_jobs", "scorecard_archive_checkpoints"]) {
    assert.match(schema, new RegExp(`create table scoring_authority\\.${table}`));
  }
  assert.match(schema, /after update of status on scoring_authority\.matches/i);
  assert.match(schema, /SCORECARD_ARCHIVE_UPSERT/);
  assert.match(schema, /SCORECARD_ARCHIVE_INVALIDATE/);
  assert.match(schema, /FINALIZED_SCORECARD_SNAPSHOT_IMMUTABLE/);
  assert.match(schema, /ARCHIVE_HOLE_SET_INVALID/);
  assert.match(schema, /for update skip locked/i);
  assert.match(schema, /ARCHIVE_STALE_WORKER_REQUEUED/);
  assert.match(schema, /FINAL_MATCH_COUNT_MISMATCH/);
  assert.match(schema, /enable row level security/gi);
  assert.doesNotMatch(schema, /create policy/i);
  assert.match(schema, /revoke all on function public\.backfill_preview_finalized_scorecard_archives\(jsonb\) from public, anon, authenticated/i);
  assert.match(drain, /create extension if not exists pg_cron/i);
  assert.match(drain, /'\*\/5 \* \* \* \*'/);
  assert.match(drain, /idgigvjjqkfbqjeredpb/);
  assert.match(drain, /length\(worker_secret\) >= 32/i);
  assert.match(fixture, /test_preview_scorecard_archive_fixture/);
  assert.match(fixture, /status = 'FINAL'/);
  assert.match(fixture, /status = 'LIVE'/);
  assert.match(fixture, /match_revision = 3/);
  assert.match(fixture, /logical_google_writes', 0/);
  assert.match(fixture, /revoke all on function public\.test_preview_scorecard_archive_fixture\(jsonb\) from public, anon, authenticated/i);
  assert.match(fixtureYear, /generate_series\(9000, 9999\)/);
  assert.match(fixtureYear, /not exists \(select 1 from scoring_authority\.tournaments where tournament_year = candidate\)/i);
  assert.match(fixtureYear, /logical_google_writes', 0/);
  assert.match(fixtureCleanup, /delete from scoring_authority\.matches where tournament_id = fixture_tournament;\s+delete from scoring_authority\.tournaments where tournament_id = fixture_tournament;/i);
  assert.match(protectedDrain, /x-vercel-protection-bypass/);
  assert.match(protectedDrain, /PREVIEW_AUTOMATION_BYPASS_REQUIRED/);
  assert.match(protectedDrain, /length\(bypass_value\) < 32/);
  assert.match(protectedDrain, /timeout_milliseconds := 60000/);
  assert.match(protectedDrain, /revoke all on function public\.configure_preview_scorecard_archive_worker\(jsonb\) from public, anon, authenticated/i);
});

test("cron endpoint requires the server-only Preview flag and worker secret", async () => {
  const route = await readFile(new URL("../app/api/cron/round-scorecards-archive/route.js", import.meta.url), "utf8");
  assert.match(route, /roundScorecardsArchiveEnvironment/);
  assert.match(route, /ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET/);
  assert.match(route, /authorization/);
  assert.match(route, /drainScorecardArchiveJobs/);
  assert.match(route, /reconcileRoundScorecardsArchives/);
  assert.match(route, /maximum: 5/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_/);
});
