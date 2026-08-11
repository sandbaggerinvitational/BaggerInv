import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCanonicalScoringAuthorityImport, reconcileCanonicalScoringAuthority } from "../lib/scoring-authority-supabase.js";
import { scoringAuthority, scoringAuthorityEnvironment } from "../lib/scoring-authority.js";
import { googleOutboxDeliveryInput, processNextGoogleOutboxEvent } from "../lib/scoring-google-outbox.js";
import { createScoringSession, verifyScoringSession } from "../lib/scoring-access.js";

const secret = "phase-2-scoring-session-secret-long-enough";
const sheet = (rows) => ({ records: rows.map((record, index) => ({ record, rowNumber: index + 2 })), headers: Object.keys(rows[0] || {}) });

function workbook({ holes = 1 } = {}) {
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
    "Team Names": sheet([{ Year: 2026, "Team Side": "Team 1", "Team ID": "T1", "Team Names": "Pickles" }, { Year: 2026, "Team Side": "Team 2", "Team ID": "T2", "Team Names": "Lipp" }]),
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
  assert.equal(failed.length, 1);
});

test("canonical migrations enforce RLS, locking, revisions, outbox ordering, cutover, and rollback guards", async () => {
  const schema = await readFile(new URL("../supabase/migrations/202608120001_preview_scoring_authority_schema.sql", import.meta.url), "utf8");
  const transactions = await readFile(new URL("../supabase/migrations/202608120002_preview_scoring_authority_transactions.sql", import.meta.url), "utf8");
  const authorization = await readFile(new URL("../supabase/migrations/202608120003_preview_scoring_authority_authorization_guards.sql", import.meta.url), "utf8");
  const precision = await readFile(new URL("../supabase/migrations/202608120004_preview_scoring_authority_course_handicap_precision.sql", import.meta.url), "utf8");
  const playingPrecision = await readFile(new URL("../supabase/migrations/202608120005_preview_scoring_authority_playing_handicap_precision.sql", import.meta.url), "utf8");
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
});

test("participant scoring routes preserve the API and delegate persistence server-side", async () => {
  const current = await readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8");
  for (const source of [current, match]) {
    assert.match(source, /persistParticipantScore/);
    assert.match(source, /measured\.authority === "supabase"/);
    assert.match(source, /drainGoogleOutbox/);
    assert.match(source, /NextResponse\.json\(\{ result: participantResult \}\)/);
  }
});

test("Preview Google outbox rehearsal stays below the observed quota burst", async () => {
  const dashboard = await readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8");
  assert.match(dashboard, /runPhase2Authority\("outbox-rehearsal", \{ cycles: 2 \}\)/);
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
