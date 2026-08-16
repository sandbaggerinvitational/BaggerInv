import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCanonicalScoringAuthorityImport, reconcileCanonicalScoringAuthority } from "../lib/scoring-authority-supabase.js";
import { scoringAuthority, scoringAuthorityEnvironment } from "../lib/scoring-authority.js";
import { googleOutboxDeliveryInput, processNextGoogleOutboxEvent } from "../lib/scoring-google-outbox.js";
import { createScoringSession, verifyScoringSession } from "../lib/scoring-access.js";

const secret = "phase-2-scoring-session-secret-long-enough";
const sheet = (rows) => ({ records: rows.map((record, index) => ({ record, rowNumber: index + 2 })), headers: Object.keys(rows[0] || {}) });
const finalizedSummary = { "Match ID": "M1", Year: 2026, Round: 1, Match: 1, Format: "BB", "Course ID": "C1",
  "Team 1 Player 1": "P1", "Team 1 Player 2": "P2", "Team 2 Player 1": "P3", "Team 2 Player 2": "P4",
  "Match Status": "Final", "Final Result": "Team 1 1 UP", Winner: "Team 1", "Matchup Winner": "Team 1",
  "Completed At": "2026-08-11T12:00:00.000Z", "Finalized At": "2026-08-11T12:00:00.000Z", "Finalized By": "Director" };
const reopenedSummary = { ...finalizedSummary, "Match Status": "Reopened", "Final Result": "", Winner: "", "Matchup Winner": "",
  "Completed At": "", "Finalized At": "", "Finalized By": "" };

function workbook({ holes = 1, captains = { 1: "P1", 2: "P3" } } = {}) {
  const players = [
    { "Player ID": "P1", "Display Name": "Player One" }, { "Player ID": "P2", "Display Name": "Player Two" },
    { "Player ID": "P3", "Display Name": "Player Three" }, { "Player ID": "P4", "Display Name": "Player Four" },
    { "Player ID": "HIST", "Display Name": "Historical Player" },
  ];
  const handicaps = [
    { Year: 2026, "Player ID": "P1", "Team Side": "Team 1", "Team ID": "T1" },
    { Year: 2026, "Player ID": "P2", "Team Side": "Team 1", "Team ID": "T1" },
    { Year: 2026, "Player ID": "P3", "Team Side": "Team 2", "Team ID": "T2" },
    { Year: 2026, "Player ID": "P4", "Team Side": "Team 2", "Team ID": "T2" },
    { Year: 2025, "Player ID": "HIST", "Team Side": "Team 1", "Team ID": "OLD" },
  ];
  const match = { Year: 2026, "Tournament ID": "SBI-2026", "Match ID": "M1", Round: 1, Format: "BB", Match: 1,
    "Course ID": "C1", Tee: "Gold", "Match Status": "Live", "Access Active": true, "Access Version": 1,
    "Updated At": "2026-08-10T12:00:00.000Z", "Team 1 Player 1": "P1", "Team 1 Player 2": "P2",
    "Team 2 Player 1": "P3", "Team 2 Player 2": "P4", "Team 1 Player 1 Playing HCP": 0,
    "Team 1 Player 2 Playing HCP": 10, "Team 2 Player 1 Playing HCP": 2, "Team 2 Player 2 Playing HCP": 4,
    "Team 1 Player 1 Stroke": 0, "Team 1 Player 2 Stroke": 10, "Team 2 Player 1 Stroke": 2, "Team 2 Player 2 Stroke": 4 };
  const courseHoles = Array.from({ length: 18 }, (_, index) => ({ "Course ID": "C1", Tee: "Gold", "Hole Number": index + 1, "Stroke Index": index + 1, Par: index % 3 === 0 ? 5 : 4, Yardage: 400 }));
  const scores = Array.from({ length: holes }, (_, index) => ({ "Hole Score ID": `M1-H${index + 1}`, "Match ID": "M1", "Hole Number": index + 1,
    "Stroke Index": index + 1, Format: "BB", "Team 1 Gross Scores": [5, 5], "Team 2 Gross Scores": [6, 6],
    "Team 1 Net Score": index === 0 ? 4 : 5, "Team 2 Net Score": 5, "Hole Winner": index === 0 ? "Team 1" : "Halved",
    Revision: 1, "Updated At": "2026-08-10T12:00:00.000Z", "Updated By": "Tester" }));
  return {
    Tournaments: sheet([{ Year: 2026, "Tournament ID": "SBI-2026", "Tournament Name": "Sandbagger Invitational" }]),
    Players: sheet(players), Handicaps: sheet(handicaps),
    "Team Names": sheet([
      { Year: 2026, "Team Side": "Team 1", "Team ID": "T1", "Team Names": "Pickles", Captain: captains[1] },
      { Year: 2026, "Team Side": "Team 2", "Team ID": "T2", "Team Names": "Lipp", Captain: captains[2] },
    ]),
    Rounds: sheet([{ Year: 2026, Round: 1, Format: "BB", "Handicap Allowance": 0.9 }, { Year: 2026, Round: 2, Format: "SC" }, { Year: 2026, Round: 3, Format: "SI" }]),
    Courses: sheet([{ Year: 2026, Format: "BB", "Course ID": "C1", "Tee Played": "Gold", Rating: 71.9, Slope: 136, Par: 72 }]),
    "Course Holes": sheet(courseHoles), "Live Matches": sheet([match]), Matches: sheet([]), "Live Hole Scores": sheet(scores),
  };
}

test("canonical import creates an explicit roster and immutable scoring snapshot", () => {
  const result = buildCanonicalScoringAuthorityImport({ sheets: workbook(), sourceWorkbookId: "preview-sheet", requestedBy: "Director" });
  assert.equal(result.counts.tournamentPlayers, 4);
  assert.deepEqual(result.payload.tournament_players.map((row) => row.player_id).sort(), ["P1", "P2", "P3", "P4"]);
  assert.equal(result.payload.players.length, 5);
  assert.equal(result.payload.snapshots.length, 1);
  assert.equal(result.payload.snapshots[0].hole_definitions.length, 18);
  assert.equal(result.payload.match_holes.length, 18);
  assert.equal(result.payload.hole_scores.length, 1);
  assert.equal(result.payload.hole_scores[0].team_1_net_score, 4);
  assert.deepEqual(result.payload.teams.map((team) => team.source_payload.Captain), ["P1", "P3"]);
});

test("canonical team import preserves captain IDs idempotently and leaves missing captain unavailable", () => {
  const first = buildCanonicalScoringAuthorityImport({ sheets: workbook(), sourceWorkbookId: "preview-sheet" });
  const second = buildCanonicalScoringAuthorityImport({ sheets: workbook(), sourceWorkbookId: "preview-sheet" });
  assert.deepEqual(second.payload.teams, first.payload.teams);
  assert.deepEqual(second.payload.tournament_players, first.payload.tournament_players);

  const missing = buildCanonicalScoringAuthorityImport({
    sheets: workbook({ captains: { 1: "", 2: "P3" } }),
    sourceWorkbookId: "preview-sheet",
  });
  assert.equal(Object.hasOwn(missing.payload.teams[0].source_payload, "Captain"), false);
  assert.equal(missing.payload.teams[1].source_payload.Captain, "P3");
});

test("canonical team import rejects unknown and wrong-team captain IDs", () => {
  assert.throws(
    () => buildCanonicalScoringAuthorityImport({
      sheets: workbook({ captains: { 1: "UNKNOWN", 2: "P3" } }),
      sourceWorkbookId: "preview-sheet",
    }),
    /Canonical captain UNKNOWN is not on the 2026 T1 roster/,
  );
  assert.throws(
    () => buildCanonicalScoringAuthorityImport({
      sheets: workbook({ captains: { 1: "P3", 2: "P1" } }),
      sourceWorkbookId: "preview-sheet",
    }),
    /Canonical captain P3 is not on the 2026 T1 roster/,
  );
});

test("zero-hole authoritative matches import without manufactured scores", () => {
  const result = buildCanonicalScoringAuthorityImport({ sheets: workbook({ holes: 0 }), sourceWorkbookId: "preview-sheet" });
  assert.equal(result.payload.matches.length, 1);
  assert.equal(result.payload.match_holes.length, 18);
  assert.equal(result.payload.hole_scores.length, 0);
  assert.equal(result.payload.matches[0].scored_holes, 0);
});

test("canonical reconciliation detects parity and genuine score drift", () => {
  const imported = buildCanonicalScoringAuthorityImport({ sheets: workbook(), sourceWorkbookId: "preview-sheet" });
  const current = { matches: imported.payload.matches, holes: imported.payload.hole_scores,
    players: imported.payload.tournament_players, snapshots: imported.payload.snapshots, permissions: imported.payload.permissions };
  assert.equal(reconcileCanonicalScoringAuthority(imported, current).pass, true);
  const drifted = { ...current, holes: [{ ...current.holes[0], team_1_net_score: 99 }] };
  assert.deepEqual(reconcileCanonicalScoringAuthority(imported, drifted).scoreDivergence, ["M1:1"]);
});

test("snapshot parity ignores mutable Live Matches Updated At but detects scoring configuration drift", () => {
  const imported = buildCanonicalScoringAuthorityImport({ sheets: workbook(), sourceWorkbookId: "preview-sheet" });
  const current = { matches: imported.payload.matches, holes: imported.payload.hole_scores,
    players: imported.payload.tournament_players,
    snapshots: imported.payload.snapshots.map((snapshot) => ({ ...snapshot, effective_at: "2026-08-11T09:00:00.000Z", canonical_hash: "f".repeat(64) })),
    permissions: imported.payload.permissions };
  assert.deepEqual(reconcileCanonicalScoringAuthority(imported, current).snapshotDivergence, []);
  const changed = { ...current, snapshots: [{ ...current.snapshots[0], tee: "Silver" }] };
  assert.deepEqual(reconcileCanonicalScoringAuthority(imported, changed).snapshotDivergence, ["M1"]);
});

test("authority feature flag defaults to Google and hard-blocks Production", () => {
  assert.equal(scoringAuthority({}), "google");
  const preview = { VERCEL_ENV: "preview", SCORING_AUTHORITY: "supabase", PREVIEW_SCORING_SHEET_ID: "preview", GOOGLE_SHEETS_SPREADSHEET_ID: "preview",
    GOOGLE_SHEETS_ID: "preview", SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "secret" };
  assert.equal(scoringAuthority(preview), "supabase");
  assert.equal(scoringAuthorityEnvironment(preview).resolved, "supabase");
  assert.equal(scoringAuthorityEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(scoringAuthorityEnvironment({ ...preview, VERCEL_ENV: "production" }).productionBlocked, true);
});

test("signed scoring session carries Player Passport identity and tournament scope without exposing it client-side", () => {
  const token = createScoringSession({ matchId: "M1", tournamentId: "SBI-2026", playerId: "P1", scorerName: "Player One", accessVersion: 4 }, secret);
  const session = verifyScoringSession(token, secret);
  assert.equal(session.playerId, "P1");
  assert.equal(session.tournamentId, "SBI-2026");
  assert.equal(session.accessVersion, 4);
});

test("Google outbox delivery uses checkpoint revisions and verifies before advancing", async () => {
  const completed = [];
  const event = { id: "00000000-0000-0000-0000-000000000001", event_type: "HOLE_SCORE_UPSERTED", match_id: "M1", match_revision: 2,
    hole_number: 7, hole_revision: 2, mutation_key: "mutation-1", attempts: 1,
    payload: { gross: { team_1: [4], team_2: [5] }, google_target_match_id: "GOOGLE-M1" } };
  const checkpoint = { last_supabase_match_revision: 1, google_match_updated_at: "2026-08-10T12:00:00.000Z", google_hole_revisions: { 7: 3 } };
  const result = await processNextGoogleOutboxEvent({ dependencies: {
    claimGoogleOutbox: async () => ({ payload: { event, checkpoint } }),
    saveLiveHoleScore: async (matchId, input) => ({ hole: { Revision: 4, "Updated At": "2026-08-10T12:00:01.000Z" }, updatedAt: "2026-08-10T12:00:01.000Z", matchId, input }),
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: { googleWriteMs: 10 } }),
    completeGoogleOutbox: async (input) => { completed.push(input); return { payload: { ok: true, checkpoint: { last_supabase_match_revision: 2 } } }; },
    failGoogleOutbox: async () => { throw new Error("should not fail"); },
  } });
  assert.equal(result.ok, true);
  assert.equal(completed[0].google_hole_revision, 4);
  assert.equal(result.checkpoint.last_supabase_match_revision, 2);
  assert.equal(googleOutboxDeliveryInput(event, checkpoint).expectedGoogleHoleRevision, 3);
  assert.equal(googleOutboxDeliveryInput(event, { ...checkpoint, google_match_updated_at: "2026-08-10T12:00:00+00:00" }).expectedGoogleMatchUpdatedAt, "2026-08-10T12:00:00.000Z");
});

test("Google outbox failure remains retryable and never advances checkpoint", async () => {
  const failed = [];
  const result = await processNextGoogleOutboxEvent({ dependencies: {
    claimGoogleOutbox: async () => ({ payload: { event: { id: "00000000-0000-0000-0000-000000000002", event_type: "HOLE_SCORE_UPSERTED", match_id: "M1", match_revision: 2, hole_number: 7, mutation_key: "m", attempts: 2, payload: { gross: { team_1: [4], team_2: [5] } } }, checkpoint: { google_hole_revisions: { 7: 1 } } } }),
    saveLiveHoleScore: async () => { const error = new Error("429"); error.status = 429; throw error; },
    failGoogleOutbox: async (input) => { failed.push(input); },
    completeGoogleOutbox: async () => { throw new Error("checkpoint must not advance"); },
  } });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "429");
  assert.equal(result.errorStage, "google-writer");
  assert.equal(result.errorMessage, "429");
  assert.equal(failed.length, 1);
});

test("Google outbox diagnostics distinguish writer failure from checkpoint failure", async () => {
  const event = { id: "00000000-0000-0000-0000-000000000003", event_type: "HOLE_SCORE_UPSERTED", match_id: "M1", match_revision: 2,
    hole_number: 7, mutation_key: "m-checkpoint", attempts: 1, payload: { gross: { team_1: [4], team_2: [5] } } };
  const result = await processNextGoogleOutboxEvent({ dependencies: {
    claimGoogleOutbox: async () => ({ payload: { event, checkpoint: { google_hole_revisions: { 7: 1 } } } }),
    saveLiveHoleScore: async () => ({ hole: { Revision: 2, "Updated At": "2026-08-10T12:00:01.000Z" } }),
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: {} }),
    completeGoogleOutbox: async () => ({ payload: { ok: false, code: "CHECKPOINT_OUT_OF_ORDER" } }),
    failGoogleOutbox: async () => {},
  } });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "CHECKPOINT_OUT_OF_ORDER");
  assert.equal(result.errorStage, "checkpoint");
  assert.match(result.errorMessage, /Checkpoint update failed/);
});

test("Finalization outbox mirrors and verifies the separate Google lock and access state", async () => {
  const calls = [];
  let completed = 0;
  const event = { id: "00000000-0000-0000-0000-000000000004", event_type: "MATCH_FINALIZED", match_id: "M1",
    match_revision: 20, mutation_key: "finalize-M1", attempts: 1,
    payload: { permission_revision: 2, scoring_locked: true, access_active: false } };
  const result = await processNextGoogleOutboxEvent({ dependencies: {
    claimGoogleOutbox: async () => ({ payload: { event, checkpoint: { last_supabase_match_revision: 19 } } }),
    finalizeLiveMatch: async (matchId, updates) => { calls.push({ matchId, updates }); return { "Match ID": matchId }; },
    readWorkbookSheetsByName: async (_tabs, options) => {
      calls.push({ fresh: options?.fresh });
      return { "Live Matches": sheet([{ "Match ID": "M1", "Match Status": "Final", "Scoring Locked": true,
        "Access Active": false, "Access Version": 2, "Updated At": "2026-08-11T12:00:00.000Z" }]), Matches: sheet([finalizedSummary]) };
    },
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: {} }),
    completeGoogleOutbox: async () => { completed += 1; return { payload: { ok: true, checkpoint: { last_supabase_match_revision: 20 } } }; },
    failGoogleOutbox: async () => { throw new Error("should not fail"); },
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], { matchId: "M1", updates: { "Scoring Locked": true, "Access Active": false, "Access Version": 2 } });
  assert.deepEqual(calls[1], { fresh: true });
  assert.equal(completed, 1);
});

test("Finalization outbox remains retryable until Google confirms the lock field", async () => {
  let completed = 0;
  let failed = 0;
  const event = { id: "00000000-0000-0000-0000-000000000005", event_type: "MATCH_FINALIZED", match_id: "M1",
    match_revision: 20, mutation_key: "finalize-M1-unverified", attempts: 1, payload: { permission_revision: 2 } };
  const result = await processNextGoogleOutboxEvent({ dependencies: {
    claimGoogleOutbox: async () => ({ payload: { event, checkpoint: {} } }),
    finalizeLiveMatch: async () => ({ "Match ID": "M1" }),
    readWorkbookSheetsByName: async () => ({ "Live Matches": sheet([{ "Match ID": "M1", "Match Status": "Final",
      "Scoring Locked": false, "Access Active": false, "Access Version": 2 }]), Matches: sheet([finalizedSummary]) }),
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: {} }),
    completeGoogleOutbox: async () => { completed += 1; return { payload: { ok: true } }; },
    failGoogleOutbox: async () => { failed += 1; },
  } });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "GOOGLE_LIFECYCLE_VERIFICATION_FAILED");
  assert.equal(result.errorStage, "google-verification");
  assert.equal(completed, 0);
  assert.equal(failed, 1);
});

test("Reopen outbox restores versioned Google access and verifies the inverse lifecycle", async () => {
  let reopenCall;
  const event = { id: "00000000-0000-0000-0000-000000000006", event_type: "MATCH_REOPENED", match_id: "M1",
    match_revision: 21, mutation_key: "reopen-M1", attempts: 1, payload: { permission_revision: 3 } };
  const result = await processNextGoogleOutboxEvent({ dependencies: {
    claimGoogleOutbox: async () => ({ payload: { event, checkpoint: { last_supabase_match_revision: 20 } } }),
    reopenLiveMatch: async (matchId, actor, updates) => { reopenCall = { matchId, actor, updates }; return { "Match ID": matchId }; },
    readWorkbookSheetsByName: async () => ({ "Live Matches": sheet([{ "Match ID": "M1", "Match Status": "Reopened",
      "Scoring Locked": false, "Access Active": true, "Access Version": 3, "Updated At": "2026-08-11T12:01:00.000Z" }]), Matches: sheet([reopenedSummary]) }),
    measure: async (_label, operation) => ({ result: await operation(), diagnostics: {} }),
    completeGoogleOutbox: async () => ({ payload: { ok: true, checkpoint: { last_supabase_match_revision: 21 } } }),
    failGoogleOutbox: async () => { throw new Error("should not fail"); },
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(reopenCall.updates, { "Scoring Locked": false, "Access Active": true, "Access Version": 3 });
});

test("canonical migrations enforce RLS, locking, revisions, outbox ordering, cutover, and rollback guards", async () => {
  const schema = await readFile(new URL("../supabase/migrations/202608120001_preview_scoring_authority_schema.sql", import.meta.url), "utf8");
  const transactions = await readFile(new URL("../supabase/migrations/202608120002_preview_scoring_authority_transactions.sql", import.meta.url), "utf8");
  const authorization = await readFile(new URL("../supabase/migrations/202608120003_preview_scoring_authority_authorization_guards.sql", import.meta.url), "utf8");
  const precision = await readFile(new URL("../supabase/migrations/202608120004_preview_scoring_authority_course_handicap_precision.sql", import.meta.url), "utf8");
  const playingPrecision = await readFile(new URL("../supabase/migrations/202608120005_preview_scoring_authority_playing_handicap_precision.sql", import.meta.url), "utf8");
  const deleteOrder = await readFile(new URL("../supabase/migrations/202608120006_preview_scoring_authority_import_delete_order.sql", import.meta.url), "utf8");
  const ingress = await readFile(new URL("../supabase/migrations/202608120007_preview_scoring_authority_cutover_ingress.sql", import.meta.url), "utf8");
  const diagnostics = await readFile(new URL("../supabase/migrations/202608120008_preview_scoring_client_diagnostics.sql", import.meta.url), "utf8");
  const finalizationPermissions = await readFile(new URL("../supabase/migrations/202608120010_preview_scoring_authority_finalization_permissions.sql", import.meta.url), "utf8");
  const scoringLockedBackfill = await readFile(new URL("../supabase/migrations/202608120011_preview_live_matches_scoring_locked_backfill.sql", import.meta.url), "utf8");
  for (const table of ["tournaments", "tournament_players", "scoring_snapshots", "matches", "match_participants", "scoring_permissions", "match_holes", "hole_scores", "score_mutations", "score_revision_history", "audit_events", "google_outbox_events", "google_match_checkpoints", "authority_epochs", "ingress_gates"]) {
    assert.match(schema, new RegExp(`create table scoring_authority\\.${table}`));
  }
  assert.match(schema, /enable row level security/i);
  assert.doesNotMatch(schema, /create policy/i);
  assert.match(schema, /match_revision = c\.last_supabase_match_revision \+ 1/i);
  assert.match(schema, /GOOGLE_BEHIND_SUPABASE/i);
  assert.match(schema, /state = 'PAUSED'/i);
  assert.match(transactions, /for update/i);
  assert.match(transactions, /IDEMPOTENCY_CONFLICT/i);
  assert.match(transactions, /MATCH_REVISION_CONFLICT/i);
  assert.match(transactions, /HOLE_REVISION_CONFLICT/i);
  assert.match(transactions, /SCORECARD_INCOMPLETE/i);
  assert.match(transactions, /insert into scoring_authority\.google_outbox_events/i);
  assert.match(transactions, /MATCH_REOPENED/i);
  assert.match(authorization, /where match_id = target_match for update/i);
  assert.match(authorization, /permission_row\.permission_revision <> match_row\.permission_revision/i);
  assert.match(authorization, /revoke all on function public\.finalize_match_authoritative_phase2_inner/i);
  assert.match(precision, /alter column course_handicap type numeric/i);
  assert.match(precision, /set course_handicap = nullif\(item->>'course_handicap', ''\)::numeric/i);
  assert.match(precision, /revoke all on function public\.replace_preview_scoring_authority_import_phase2_inner/i);
  assert.match(playingPrecision, /alter column playing_handicap type numeric/i);
  assert.match(playingPrecision, /set playing_handicap = nullif\(item->>'playing_handicap', ''\)::numeric/i);
  assert.ok(deleteOrder.indexOf("delete from scoring_authority.matches") < deleteOrder.indexOf("delete from scoring_authority.scoring_snapshots"));
  assert.match(deleteOrder, /revoke all on function public\.replace_preview_scoring_authority_import_phase2_delete_inner/i);
  assert.match(ingress, /create table if not exists scoring_authority\.scoring_ingress_leases/i);
  assert.match(ingress, /enable row level security/i);
  assert.match(ingress, /where tournament_id = tournament_key for update/i);
  assert.match(ingress, /SCORING_INGRESS_PAUSED/i);
  assert.match(ingress, /AUTHORITY_BOUNDARY_MISMATCH/i);
  assert.match(ingress, /requested_type = 'CUTOVER'.*GOOGLE_OUTBOX_NOT_DRAINED/is);
  assert.match(ingress, /grant execute on function %s to service_role/i);
  assert.match(diagnostics, /create table scoring_authority\.client_diagnostics/i);
  assert.match(diagnostics, /enable row level security/i);
  assert.match(diagnostics, /revoke all on table scoring_authority\.client_diagnostics from public, anon, authenticated/i);
  assert.match(diagnostics, /grant execute on function public\.record_preview_scoring_client_diagnostic\(jsonb\) to service_role/i);
  assert.match(diagnostics, /create or replace function public\.read_preview_scoring_participant_context\(input jsonb\)/i);
  assert.match(diagnostics, /permission_ok and match_row\.status <> 'FINAL' and not match_row\.scoring_locked/i);
  assert.match(diagnostics, /revoke all on function public\.read_preview_scoring_participant_context\(jsonb\) from public, anon, authenticated/i);
  assert.match(finalizationPermissions, /permission_revision = next_permission_revision/i);
  assert.match(finalizationPermissions, /can_score = false[\s\S]+revoked_at = transition_at/i);
  assert.match(finalizationPermissions, /can_score = true[\s\S]+revoked_at = null/i);
  assert.match(finalizationPermissions, /FINALIZATION_PERMISSION_REPAIRED/i);
  assert.match(finalizationPermissions, /match_row\.match_revision, match_row\.match_revision/i,
    "the one-time repair preserves the authoritative match revision");
  assert.match(finalizationPermissions, /revoke all on function public\.repair_preview_finalization_parity\(jsonb\) from public, anon, authenticated/i);
  assert.match(finalizationPermissions, /grant execute on function public\.repair_preview_finalization_parity\(jsonb\) to service_role/i);
  assert.match(scoringLockedBackfill, /status = 'FINAL' and not scoring_locked/i);
  assert.match(scoringLockedBackfill, /match_revision_unchanged.*hole_revisions_unchanged.*permission_revision_unchanged/is);
  assert.doesNotMatch(scoringLockedBackfill, /set[\s\S]{0,120}match_revision\s*=/i);
  assert.doesNotMatch(scoringLockedBackfill, /update scoring_authority\.hole_scores/i);
  assert.match(scoringLockedBackfill, /revoke all on function public\.backfill_preview_final_match_locks\(jsonb\) from public, anon, authenticated/i);
  assert.match(scoringLockedBackfill, /grant execute on function public\.backfill_preview_final_match_locks\(jsonb\) to service_role/i);
});

test("Preview Live Matches migration inserts exactly one canonical column and verifies preservation", async () => {
  const writer = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/director/scoring-authority/route.js", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8");
  const migration = writer.match(/export async function migratePreviewLiveMatchScoringLock[\s\S]+?\n}\n/)?.[0] || "";
  assert.equal((migration.match(/insertDimension/g) || []).length, 1);
  assert.match(migration, /endIndex: targetIndex \+ 1/);
  assert.match(migration, /boolValue: \/\^final\$\/i/);
  assert.match(migration, /Live Matches schema migration is Preview-only/);
  for (const field of ["headers", "rowCount", "matchIds", "existingValues", "formulaTopology", "holeScores", "archivedMatches"]) {
    assert.match(migration, new RegExp(`${field}:`));
  }
  assert.match(route, /action === "migrate-preview-scoring-lock-schema"/);
  assert.match(route, /pending_outbox/);
  assert.match(route, /matchRevision\) !== 20|match_revision\) !== 20/);
  assert.match(route, /backfillCanonicalFinalMatchLocks/);
  assert.match(route, /repairFinalizationParity\(actorId, "2026-R3-4"\)/);
  assert.match(dashboard, /Migrate Preview Scoring Lock/);
});

test("Preview Director repair is gated, audited, and never re-finalizes or changes holes", async () => {
  const route = await readFile(new URL("../app/api/director/scoring-authority/route.js", import.meta.url), "utf8");
  const writer = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8");
  assert.match(route, /action === "repair-finalization-parity"/);
  assert.match(route, /expected_match_revision: number\(match\.match_revision\)/);
  assert.match(route, /repairFinalizedLiveMatchParity/);
  assert.match(route, /completeCanonicalFinalizationParityRepair/);
  assert.match(writer, /Only a finalized Preview match can be parity-repaired/);
  assert.match(writer, /"Scoring Locked": "TRUE"/);
  assert.match(writer, /"Access Active": "FALSE"/);
  assert.match(writer, /Finalized Preview lifecycle parity did not verify from Google/);
  assert.doesNotMatch(writer.match(/export async function repairFinalizedLiveMatchParity[\s\S]+?\n}\n/)?.[0] || "", /Live Hole Scores/);
  assert.match(dashboard, /Repair Selected Final Parity/);
});

test("participant scoring routes preserve the API and delegate persistence server-side", async () => {
  const current = await readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8");
  for (const source of [current, match]) {
    assert.match(source, /persistParticipantScore/);
    assert.match(source, /measured\.authority === "supabase"/);
    assert.match(source, /drainGoogleOutbox/);
    assert.match(source, /NextResponse\.json\(\{\s*result: participantResult/);
  }
});

test("Preview Director exposes only the explicit prepared cutover and rollback controls", async () => {
  const dashboard = await readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/director/scoring-authority/route.js", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../lib/scoring-persistence-adapter.js", import.meta.url), "utf8");
  assert.match(dashboard, /Pause \+ Prepare Cutover/);
  assert.match(dashboard, /Commit Cutover Epoch/);
  assert.match(dashboard, /Pause \+ Prepare Rollback/);
  assert.match(dashboard, /Drain \+ Commit Rollback/);
  assert.match(route, /requireCutoverSnapshot/);
  assert.match(route, /action === "prepare-cutover"/);
  assert.match(route, /action === "commit-cutover"/);
  assert.match(adapter, /beginScoringIngress/);
  assert.match(adapter, /completeScoringIngress/);
});

test("Phase 2 Director diagnostics retain safe PostgREST errors without exposing credentials", async () => {
  const shadow = await readFile(new URL("../lib/scoring-shadow.js", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/director/scoring-authority/route.js", import.meta.url), "utf8");
  assert.match(shadow, /message: payload\?\.message/);
  assert.match(route, /diagnostics\.message \|\| error\?\.message/);
  assert.doesNotMatch(route, /SUPABASE_SCORING_MIRROR_SECRET_KEY/);
  assert.match(route, /tournament_year: number\(base\.tournament\.tournament_year\) \+ 1000/);
  assert.match(route, /phase2-rehearsal-cleanup/);
  assert.match(route, /const cleanup = await cleanupRehearsal\(setup, actorId\)/);
});
