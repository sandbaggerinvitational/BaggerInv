import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cleanupProductionStep11ScoringRehearsal,
  commitProductionStep11AuthorityEpoch,
  createProductionStep11ScoringRehearsal,
  drainProductionStep11VirtualWorkers,
  finalizeProductionStep11Match,
  markLiveProductionStep11Match,
  prepareProductionStep11AuthorityEpoch,
  processProductionStep11VirtualWorker,
  productionStep11Fingerprint,
  productionStep11RehearsalSafetyEvidence,
  productionStep11ScoringRehearsalEnvironment,
  reopenProductionStep11Match,
  rollbackProductionStep11ScoringRehearsal,
  setProductionStep11ScoringAccess,
  setProductionStep11ScoringLock,
  submitProductionStep11HoleScore,
} from "../lib/production-step11-scoring-rehearsal.js";
import { processNextGoogleOutboxEvent } from "../lib/scoring-google-outbox.js";

const SHA = "f3a59064cf9131f5d70d7487f1e771eb9d8cf174";
const HOST = "bagger-inv-git-step11-sandbagger-invitational.vercel.app";
const HASH_2026 = "2".repeat(64);
const HASH_S3 = "3".repeat(64);
const TOKEN_HASH = "4".repeat(64);

function source() {
  return {
    sourceTournamentId: "2025",
    sourceTournamentYear: 2025,
    sourceMatchId: "2025-R3-1",
    sourceFingerprint: "5".repeat(64),
    status: "FINAL",
    format: "SI",
    participantIds: ["P1", "P2"],
    courseId: "PRODUCTION-COURSE",
    tee: "Gold",
    roundNumber: 3,
  };
}

function rehearsal() {
  const createdAt = new Date();
  return createProductionStep11ScoringRehearsal({
    runId: "11111111-1111-4111-8111-111111111111",
    candidateSha: SHA,
    candidateHostname: HOST,
    directorPlayerId: "CB01",
    source: source(),
    current2026Fingerprint: HASH_2026,
    s3Fingerprint: HASH_S3,
    runTokenFingerprint: TOKEN_HASH,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
  });
}

function activate(state) {
  const epoch = prepareProductionStep11AuthorityEpoch(state, { actor: "CB01" });
  commitProductionStep11AuthorityEpoch(state, { actor: "CB01", epochId: epoch.epochId });
  return epoch;
}

function directorMutation(state, operation, payload = {}) {
  return {
    actor: "CB01",
    mutationKey: `${operation}-${state.match.matchRevision}`,
    expectedMatchRevision: state.match.matchRevision,
    payload,
  };
}

function score(state, holeNumber, mutationKey = `score-${holeNumber}`) {
  return submitProductionStep11HoleScore(state, {
    actor: "P1",
    mutationKey,
    expectedMatchRevision: state.match.matchRevision,
    expectedHoleRevision: state.holes[String(holeNumber)]?.holeRevision || 0,
    permissionRevision: state.match.permissionRevision,
    payload: {
      holeNumber,
      team1GrossScores: [holeNumber % 2 ? 4 : 5],
      team2GrossScores: [holeNumber % 2 ? 5 : 4],
    },
  });
}

test("Step 11 runtime gate requires exact isolated SHA/resources and forbids all live authority features", () => {
  const env = {
    PRODUCTION_STEP11_SCORING_REHEARSAL_ENABLED: "true",
    PRODUCTION_STEP11_SCORING_REHEARSAL_SHA: SHA,
    PRODUCTION_STEP11_SCORING_REHEARSAL_HOSTNAME: HOST,
    PRODUCTION_STEP11_SCORING_REHEARSAL_SECRET: "s".repeat(32),
    PRODUCTION_STEP11_S3_FINGERPRINT: HASH_S3,
    PRODUCTION_SUPABASE_PROJECT_REF: "ymqhhtxaywtqllynrmxe",
    PRODUCTION_SUPABASE_URL: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    GOOGLE_SHEETS_ID: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_SHA: SHA,
    VERCEL_BRANCH_URL: HOST,
    SCORING_AUTHORITY: "google",
    PARTICIPANT_IDENTITY_AUTHORITY: "passport",
  };
  assert.equal(productionStep11ScoringRehearsalEnvironment(env).allowed, true);
  assert.equal(productionStep11ScoringRehearsalEnvironment({ ...env, VERCEL_ENV: "production" }).allowed, false);
  assert.equal(productionStep11ScoringRehearsalEnvironment({ ...env, SCORING_AUTHORITY: "supabase" }).allowed, false);
  assert.equal(productionStep11ScoringRehearsalEnvironment({ ...env, PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true" }).allowed, false);
  assert.equal(productionStep11ScoringRehearsalEnvironment({ ...env, PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED: "true" }).allowed, false);
  assert.equal(productionStep11ScoringRehearsalEnvironment({ ...env, PRODUCTION_STEP11_S3_FINGERPRINT: "" }).allowed, false);
  assert.equal(productionStep11ScoringRehearsalEnvironment({ ...env, GOOGLE_SHEETS_ID: "preview" }).allowed, false);
});

test("rehearsal fixtures can derive only from a completed historical Production match", () => {
  assert.throws(() => createProductionStep11ScoringRehearsal({
    runId: "11111111-1111-4111-8111-111111111111", candidateSha: SHA, candidateHostname: HOST,
    directorPlayerId: "CB01", source: { ...source(), sourceTournamentId: "2026", sourceTournamentYear: 2026 },
    current2026Fingerprint: HASH_2026, s3Fingerprint: HASH_S3, runTokenFingerprint: TOKEN_HASH,
  }), /STEP11_COMPLETED_PRODUCTION_SOURCE_REQUIRED|STEP11_LIVE_TOURNAMENT_SOURCE_FORBIDDEN/);
  const state = rehearsal();
  assert.match(state.run.syntheticTournamentId, /^STEP11-/);
  assert.notEqual(state.run.syntheticTournamentId, "2026");
  assert.equal(state.run.source.sourceTournamentId, "2025");
  assert.equal(state.run.externalGoogleWrites, 0);
  assert.equal(state.run.live2026Writes, 0);
});

test("authority epoch, lifecycle, permission, scoring, Finalize, Reopen, and re-Finalize are atomic and idempotent", () => {
  const state = rehearsal();
  const epoch = activate(state);
  assert.equal(epoch.authorityBefore, "GOOGLE");
  assert.equal(state.ingress.authority, "SUPABASE");
  assert.equal(state.ingress.state, "OPEN");

  const marked = markLiveProductionStep11Match(state, directorMutation(state, "mark"));
  assert.equal(state.match.status, "LIVE");
  assert.equal(marked.matchRevision, 1);

  setProductionStep11ScoringLock(state, directorMutation(state, "lock", { locked: true }));
  assert.throws(() => score(state, 1), /STEP11_SCORING_LOCKED/);
  setProductionStep11ScoringLock(state, directorMutation(state, "unlock", { locked: false }));
  setProductionStep11ScoringAccess(state, directorMutation(state, "revoke", { active: false }));
  assert.throws(() => score(state, 1), /STEP11_SCORING_ACCESS_REVOKED/);
  setProductionStep11ScoringAccess(state, directorMutation(state, "enable", { active: true }));

  const firstInputRevision = state.match.matchRevision;
  const first = score(state, 1, "double-submit-score-1");
  const replay = submitProductionStep11HoleScore(state, {
    actor: "P1", mutationKey: "double-submit-score-1",
    expectedMatchRevision: firstInputRevision, expectedHoleRevision: 0,
    permissionRevision: state.match.permissionRevision,
    payload: { holeNumber: 1, team1GrossScores: [4], team2GrossScores: [5] },
  });
  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.equal(state.holes["1"].holeRevision, 1);
  assert.throws(() => submitProductionStep11HoleScore(state, {
    actor: "P1", mutationKey: "stale-tab", expectedMatchRevision: firstInputRevision,
    expectedHoleRevision: 1, permissionRevision: state.match.permissionRevision,
    payload: { holeNumber: 1, team1GrossScores: [5], team2GrossScores: [4] },
  }), /STEP11_MATCH_REVISION_CONFLICT/);

  for (let hole = 2; hole <= 18; hole += 1) score(state, hole);
  const finalized = finalizeProductionStep11Match(state, directorMutation(state, "finalize"));
  assert.equal(finalized.status, "FINAL");
  assert.equal(state.match.scoringLocked, true);
  assert.equal(state.match.accessActive, false);
  assert.equal(state.archiveJobs.at(-1).eventType, "SCORECARD_ARCHIVE_UPSERT");

  reopenProductionStep11Match(state, directorMutation(state, "reopen"));
  assert.equal(state.match.status, "REOPENED");
  assert.equal(state.archiveJobs.at(-1).eventType, "SCORECARD_ARCHIVE_INVALIDATE");
  score(state, 18, "correct-hole-18");
  finalizeProductionStep11Match(state, directorMutation(state, "refinalize"));
  assert.equal(state.match.status, "FINAL");
  assert.equal(state.archiveJobs.at(-1).eventType, "SCORECARD_ARCHIVE_UPSERT");
  assert.equal(new Set(state.mutations.map((mutation) => mutation.mutationKey)).size, state.mutations.length);
});

test("participants cannot invoke Director lifecycle, authority, permission, or cleanup controls", () => {
  const state = rehearsal();
  assert.throws(() => prepareProductionStep11AuthorityEpoch(state, { actor: "P1" }),
    /STEP11_DIRECTOR_AUTHORIZATION_REQUIRED/);
  activate(state);
  assert.throws(() => markLiveProductionStep11Match(state, {
    actor: "P1", mutationKey: "participant-mark-live", expectedMatchRevision: 0, payload: {},
  }), /STEP11_DIRECTOR_AUTHORIZATION_REQUIRED/);
  markLiveProductionStep11Match(state, directorMutation(state, "mark"));
  assert.throws(() => setProductionStep11ScoringLock(state, {
    actor: "P1", mutationKey: "participant-lock", expectedMatchRevision: state.match.matchRevision,
    payload: { locked: true },
  }), /STEP11_DIRECTOR_AUTHORIZATION_REQUIRED/);
  assert.throws(() => setProductionStep11ScoringAccess(state, {
    actor: "P1", mutationKey: "participant-access", expectedMatchRevision: state.match.matchRevision,
    payload: { active: false },
  }), /STEP11_DIRECTOR_AUTHORIZATION_REQUIRED/);
});

test("virtual mirror/archive suppress duplicate external delivery across every interruption window", () => {
  const state = rehearsal();
  activate(state);
  markLiveProductionStep11Match(state, directorMutation(state, "mark"));
  const firstJobId = state.outbox[0].id;
  let report = processProductionStep11VirtualWorker(state, {
    queue: "mirror", failAt: "after-external-delivery-before-checkpoint",
  });
  assert.equal(report.ok, false);
  assert.equal(report.externalGoogleWrites, 0);
  assert.equal(state.outbox[0].status, "RETRYABLE");
  report = processProductionStep11VirtualWorker(state, { queue: "mirror" });
  assert.equal(report.ok, true);
  assert.equal(report.jobId, firstJobId);
  assert.equal(report.duplicateSuppressed, true);
  assert.equal(Object.keys(state.virtualGoogle.deliveries).length, 1);

  for (let hole = 1; hole <= 18; hole += 1) score(state, hole);
  finalizeProductionStep11Match(state, directorMutation(state, "finalize"));
  report = processProductionStep11VirtualWorker(state, { queue: "archive", failAt: "after-claim" });
  assert.equal(report.stage, "claimed");
  report = processProductionStep11VirtualWorker(state, {
    queue: "archive", failAt: "after-external-delivery-before-checkpoint",
  });
  assert.equal(report.stage, "external-delivered");
  report = processProductionStep11VirtualWorker(state, { queue: "archive" });
  assert.equal(report.duplicateSuppressed, true);
  drainProductionStep11VirtualWorkers(state);
  assert.equal(state.outbox.every((job) => job.status === "DELIVERED"), true);
  assert.equal(state.archiveJobs.every((job) => job.status === "DELIVERED"), true);
  assert.equal(state.run.externalGoogleWrites, 0);
});

test("post-write rollback reconciles every synthetic write and cleanup proves S3/2026 unchanged", () => {
  const state = rehearsal();
  activate(state);
  markLiveProductionStep11Match(state, directorMutation(state, "mark"));
  for (let hole = 1; hole <= 18; hole += 1) score(state, hole);
  finalizeProductionStep11Match(state, directorMutation(state, "finalize"));
  processProductionStep11VirtualWorker(state, { queue: "mirror" });
  const evidence = rollbackProductionStep11ScoringRehearsal(state, { actor: "CB01" });
  assert.equal(evidence.supabaseAuthoritativeWrites, 20);
  assert.equal(evidence.alreadyRepresentedInMirror, 1);
  assert.equal(evidence.successfullyReconciled, 19);
  assert.equal(evidence.duplicates, 0);
  assert.equal(evidence.unresolved, 0);
  assert.equal(evidence.lost, 0);
  assert.equal(evidence.finalSupabaseFingerprint, evidence.finalRollbackTargetFingerprint);
  assert.equal(evidence.finalAuthorityState, "GOOGLE");
  const cleanup = cleanupProductionStep11ScoringRehearsal(state, {
    actor: "CB01", current2026FingerprintAfter: HASH_2026, s3FingerprintAfter: HASH_S3,
  });
  assert.equal(cleanup.certified, true);
  assert.equal(cleanup.current2026FingerprintBefore, cleanup.current2026FingerprintAfter);
  assert.equal(cleanup.s3FingerprintBefore, cleanup.s3FingerprintAfter);
  assert.equal(productionStep11RehearsalSafetyEvidence(state).cleanupCertified, true);
  assert.equal(state.run.status, "CLEANED");
});

test("cleanup fails closed on Production current-state or S3 drift", () => {
  const state = rehearsal();
  activate(state);
  markLiveProductionStep11Match(state, directorMutation(state, "mark"));
  rollbackProductionStep11ScoringRehearsal(state, { actor: "CB01" });
  assert.throws(() => cleanupProductionStep11ScoringRehearsal(state, {
    actor: "CB01", current2026FingerprintAfter: "9".repeat(64), s3FingerprintAfter: HASH_S3,
  }), /STEP11_CURRENT_2026_CHANGED/);
});

test("idempotent mutation replays are unavailable after rehearsal authority is rolled back", () => {
  const state = rehearsal();
  activate(state);
  const marked = markLiveProductionStep11Match(state, directorMutation(state, "mark"));
  rollbackProductionStep11ScoringRehearsal(state, { actor: "CB01" });
  assert.throws(() => markLiveProductionStep11Match(state, {
    actor: "CB01", mutationKey: marked.mutationKey,
    expectedMatchRevision: 0, payload: {},
  }), /STEP11_SUPABASE_REHEARSAL_INGRESS_REQUIRED/);
});

test("Production migration is service-role-only, expiring, exact-resource, synthetic-only, and read-only to canonical facts", async () => {
  const sql = await readFile(new URL("../supabase/production_migrations/202608240018_production_step11_scoring_rehearsal.sql", import.meta.url), "utf8");
  for (const value of [
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  ]) assert.match(sql, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /synthetic_tournament_id ~ '\^STEP11-/i);
  assert.match(sql, /source_tournament_year integer not null check \(source_tournament_year between 2017 and 2025\)/i);
  assert.match(sql, /source_tournament_id text not null check \(source_tournament_id <> '2026'\)/i);
  assert.match(sql, /candidate_sha ~ '\^\[0-9a-f\]\{40\}\$'/i);
  assert.match(sql, /run_token_hash/);
  assert.match(sql, /PRODUCTION_STEP11_ACTIVE_DIRECTOR_REQUIRED/);
  assert.match(sql, /join participant_identity\.user_player_links/);
  assert.match(sql, /digest\(\(input->'frozen_fixture'\)::text,'sha256'\)/i);
  assert.match(sql, /completed_source_fixture\(requested_match_id text\)/i);
  assert.match(sql, /input->'frozen_fixture' <> database_fixture/i);
  assert.match(sql, /PRODUCTION_STEP11_SOURCE_FIXTURE_MISMATCH/);
  assert.match(sql, /inspect_production_step11_scoring_rehearsal\(input jsonb\)/i);
  assert.match(sql, /grant execute on function public\.inspect_production_step11_scoring_rehearsal\(jsonb\) to service_role/i);
  assert.match(sql, /mutation_key text not null default ''/i);
  assert.match(sql, /'idempotent',true/i);
  assert.match(sql, /PRODUCTION_STEP11_EVIDENCE_IDEMPOTENCY_CONFLICT/);
  assert.doesNotMatch(sql, /on conflict \(run_id, event_type, mutation_key\) do update/i);
  assert.match(sql, /PRODUCTION_STEP11_EPOCH_COMMIT_STATE_REQUIRED/);
  assert.match(sql, /expires_at > created_at and expires_at <= created_at \+ interval '4 hours'/i);
  assert.match(sql, /external_transport = 'VIRTUAL'/i);
  assert.match(sql, /external_google_writes = 0/i);
  assert.match(sql, /live_2026_writes = 0/i);
  assert.match(sql, /current_2026_fingerprint_before = current_2026_fingerprint_after/i);
  assert.match(sql, /s3_fingerprint_before = s3_fingerprint_after/i);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+scoring_authority\./i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
  assert.match(sql, /grant execute on function public\.begin_production_step11_scoring_rehearsal\(jsonb\) to service_role/i);
});

const sheet = (rows) => ({ records: rows.map((record, index) => ({ record, rowNumber: index + 2 })) });

test("Finalize retry verifies already-delivered Google state and never repeats writer side effects", async () => {
  const event = {
    id: "00000000-0000-4000-8000-000000000011",
    event_type: "MATCH_FINALIZED",
    match_id: "M1",
    match_revision: 20,
    mutation_key: "finalize-once",
    attempts: 2,
    payload: { permission_revision: 2, result_winner: "Team 1", scorecard_complete: true },
  };
  const sheets = {
    "Live Matches": sheet([{
      "Match ID": "M1", "Match Status": "Final", "Scoring Locked": true,
      "Access Active": false, "Access Version": 2, "Updated At": "2026-08-24T12:00:00.000Z",
    }]),
    Matches: sheet([{
      "Match ID": "M1", "Match Status": "Final", "Finalized At": "2026-08-24T12:00:00.000Z",
      "Finalized By": "Director", "Completed At": "2026-08-24T12:00:00.000Z",
      "Final Result": "Team 1 wins", Winner: "Team 1", "Matchup Winner": "Team 1",
      Year: 2026, Round: 1, Match: 1, Format: "SI", "Course ID": "C1",
      "Team 1 Player 1": "P1", "Team 2 Player 1": "P2",
    }]),
  };
  let finalizeCalls = 0;
  let completionCalls = 0;
  const dependencies = {
    claimGoogleOutbox: async () => ({ payload: { event, checkpoint: { last_supabase_match_revision: 19 } } }),
    finalizeLiveMatch: async () => { finalizeCalls += 1; throw new Error("must not repeat Finalize"); },
    readWorkbookSheetsByName: async () => sheets,
    measure: async (_name, operation) => ({ result: await operation(), diagnostics: {} }),
    completeGoogleOutbox: async () => {
      completionCalls += 1;
      if (completionCalls === 1) throw new Error("checkpoint unavailable");
      return { payload: { ok: true, checkpoint: { last_supabase_match_revision: 20 } } };
    },
    failGoogleOutbox: async () => ({ payload: { ok: true } }),
  };
  const failed = await processNextGoogleOutboxEvent({ dependencies });
  assert.equal(failed.ok, false);
  assert.equal(failed.errorStage, "checkpoint");
  const retried = await processNextGoogleOutboxEvent({ dependencies });
  assert.equal(retried.ok, true);
  assert.equal(finalizeCalls, 0);
  assert.equal(completionCalls, 2);
});

test("rehearsal implementation cannot resolve a real Google writer", async () => {
  const sourceCode = await readFile(new URL("../lib/production-step11-scoring-rehearsal.js", import.meta.url), "utf8");
  assert.doesNotMatch(sourceCode, /google-sheets-write|saveLiveHoleScore|finalizeLiveMatch|reopenLiveMatch/);
  assert.doesNotMatch(sourceCode, /fetch\s*\(|sheets\.googleapis|docs\.google\.com/);
  assert.match(sourceCode, /externalGoogleWrites:\s*0/);
  assert.equal(productionStep11Fingerprint({ b: 2, a: 1 }), productionStep11Fingerprint({ a: 1, b: 2 }));
});
