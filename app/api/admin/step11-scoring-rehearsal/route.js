import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  cleanupProductionStep11ScoringRehearsal,
  commitProductionStep11AuthorityEpoch,
  createProductionStep11ScoringRehearsal,
  drainProductionStep11VirtualWorkers,
  finalizeProductionStep11Match,
  markLiveProductionStep11Match,
  prepareProductionStep11AuthorityEpoch,
  processProductionStep11VirtualWorker,
  productionStep11RehearsalSafetyEvidence,
  productionStep11ScoringRehearsalEnvironment,
  reopenProductionStep11Match,
  rollbackProductionStep11ScoringRehearsal,
  setProductionStep11ScoringAccess,
  setProductionStep11ScoringLock,
  submitProductionStep11HoleScore,
} from "../../../../lib/production-step11-scoring-rehearsal.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../../../../lib/production-foundation-resource-contract.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

function safeEqual(left, right) {
  const a = Buffer.from(sha256(left));
  const b = Buffer.from(sha256(right));
  return timingSafeEqual(a, b);
}

function errorResponse(error) {
  const status = Number(error?.status || 500);
  return NextResponse.json({
    ok: false,
    code: clean(error?.code || "PRODUCTION_STEP11_REHEARSAL_FAILED"),
    reason: clean(error?.reason || error?.code || "rehearsal-failed"),
  }, { status: status >= 400 && status <= 599 ? status : 500 });
}

function assertRequest(request, state) {
  const requestUrl = new URL(request.url);
  const expectedHost = state.resources.candidateHostname;
  const host = clean(request.headers.get("host")).toLowerCase();
  const forwardedHost = clean(request.headers.get("x-forwarded-host") || host).split(",")[0].toLowerCase();
  const origin = clean(request.headers.get("origin"));
  if (requestUrl.protocol !== "https:" || requestUrl.hostname !== expectedHost ||
      host !== expectedHost || forwardedHost !== expectedHost ||
      (origin && origin !== `https://${expectedHost}`)) {
    const error = new Error("The Step 11 rehearsal request does not match the isolated candidate.");
    error.code = "PRODUCTION_STEP11_REHEARSAL_REQUEST_MISMATCH";
    error.status = 403;
    throw error;
  }
  const supplied = clean(request.headers.get("x-step11-rehearsal-token"));
  const expected = clean(process.env.PRODUCTION_STEP11_SCORING_REHEARSAL_SECRET);
  if (!supplied || !expected || !safeEqual(supplied, expected)) {
    const error = new Error("The Step 11 rehearsal token is invalid.");
    error.code = "PRODUCTION_STEP11_REHEARSAL_TOKEN_INVALID";
    error.status = 404;
    throw error;
  }
  return supplied;
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

async function rpc(functionName, input) {
  const secret = clean(process.env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (!secret) throw Object.assign(new Error("Production Supabase is unavailable."), {
    code: "PRODUCTION_SUPABASE_SECRET_REQUIRED", status: 503,
  });
  const response = await fetch(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Step 11 Production RPC failed (${response.status}).`);
    error.code = clean(payload?.message || payload?.code || "PRODUCTION_STEP11_RPC_FAILED").slice(0, 160);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function scopeInput(state, runToken, extra = {}) {
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    candidate_sha: state.resources.candidateSha,
    candidate_hostname: state.resources.candidateHostname,
    run_token: runToken,
    ...extra,
  };
}

function directorMutation(state, operation, payload = {}) {
  return {
    actor: state.run.directorPlayerId,
    mutationKey: `${operation}-${state.match.matchRevision}`,
    expectedMatchRevision: state.match.matchRevision,
    payload,
  };
}

function participantScore(state, actor, holeNumber, mutationKey, scores = {}) {
  return submitProductionStep11HoleScore(state, {
    actor,
    mutationKey,
    expectedMatchRevision: state.match.matchRevision,
    expectedHoleRevision: state.holes[String(holeNumber)]?.holeRevision || 0,
    permissionRevision: state.match.permissionRevision,
    payload: {
      holeNumber,
      team1GrossScores: scores.team1 || [holeNumber % 2 ? 4 : 5],
      team2GrossScores: scores.team2 || [holeNumber % 2 ? 5 : 4],
    },
  });
}

function eventEvidence(state, extra = {}) {
  return {
    tournamentId: state.run.syntheticTournamentId,
    matchId: state.match.matchId,
    authority: state.ingress.authority,
    ingress: state.ingress.state,
    matchRevision: state.match.matchRevision,
    permissionRevision: state.match.permissionRevision,
    externalGoogleWrites: 0,
    live2026Writes: 0,
    ...extra,
  };
}

function requireOutcome(condition, code) {
  if (condition) return;
  throw Object.assign(new Error(code), { code, status: 409 });
}

async function recordEvent(state, runToken, eventType, mutationKey, evidence) {
  return rpc("record_production_step11_scoring_rehearsal_evidence", scopeInput(state.run.environment, runToken, {
    run_id: state.run.runId,
    synthetic_tournament_id: state.run.syntheticTournamentId,
    event_type: eventType,
    mutation_key: mutationKey || "",
    evidence,
  }));
}

async function runRehearsal(environment, runToken) {
  const actorId = "CB01";
  const inspect = await rpc("inspect_production_step11_scoring_rehearsal", scopeInput(environment, runToken, {
    actor_id: actorId,
  }));
  if (inspect?.ok !== true || !inspect.fixture || !/^[0-9a-f]{64}$/.test(clean(inspect.fixtureFingerprint))) {
    throw Object.assign(new Error("The Production-derived rehearsal fixture is unavailable."), {
      code: "PRODUCTION_STEP11_FIXTURE_UNAVAILABLE", status: 503,
    });
  }

  const runId = randomUUID();
  const authorizationId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
  const state = createProductionStep11ScoringRehearsal({
    runId,
    candidateSha: environment.resources.candidateSha,
    candidateHostname: environment.resources.candidateHostname,
    directorPlayerId: actorId,
    source: { ...inspect.fixture, sourceFingerprint: inspect.sourceFingerprint },
    current2026Fingerprint: inspect.current2026Fingerprint,
    s3Fingerprint: clean(process.env.PRODUCTION_STEP11_S3_FINGERPRINT).toLowerCase(),
    runTokenFingerprint: sha256(runToken),
    createdAt,
    expiresAt,
  });
  state.run.environment = environment;

  const beginInput = scopeInput(environment, runToken, {
    run_id: runId,
    contract_version: state.contractVersion,
    runtime_candidate_sha: environment.resources.candidateSha,
    actor_id: actorId,
    synthetic_tournament_id: state.run.syntheticTournamentId,
    source_tournament_id: inspect.fixture.sourceTournamentId,
    source_tournament_year: inspect.fixture.sourceTournamentYear,
    source_match_id: inspect.fixture.sourceMatchId,
    source_fingerprint: inspect.sourceFingerprint,
    frozen_fixture: inspect.fixture,
    frozen_fixture_fingerprint: inspect.fixtureFingerprint,
    s3_fingerprint: state.run.s3Fingerprint,
    expected_current_2026_fingerprint: inspect.current2026Fingerprint,
    expires_at: expiresAt.toISOString(),
    director_authorization: {
      authorized: true,
      scope: "PRODUCTION_STEP11_SCORING_REHEARSAL",
      actor_id: actorId,
      authorization_id: authorizationId,
      authorized_at: createdAt.toISOString(),
    },
  });
  const begun = await rpc("begin_production_step11_scoring_rehearsal", beginInput);
  const begunRetry = await rpc("begin_production_step11_scoring_rehearsal", beginInput);

  const epoch = prepareProductionStep11AuthorityEpoch(state, { actor: actorId });
  await recordEvent(state, runToken, "AUTHORITY_EPOCH_PREPARED", epoch.epochId,
    eventEvidence(state, { epochId: epoch.epochId }));
  commitProductionStep11AuthorityEpoch(state, { actor: actorId, epochId: epoch.epochId });
  await recordEvent(state, runToken, "AUTHORITY_EPOCH_COMMITTED", epoch.epochId,
    eventEvidence(state, { epochId: epoch.epochId }));

  const marked = markLiveProductionStep11Match(state, directorMutation(state, "mark-live"));
  await recordEvent(state, runToken, "MATCH_MARKED_LIVE", marked.mutationKey, eventEvidence(state));
  const locked = setProductionStep11ScoringLock(state, directorMutation(state, "lock", { locked: true }));
  await recordEvent(state, runToken, "SCORING_LOCKED", locked.mutationKey, eventEvidence(state));
  let lockFailure = "";
  try { participantScore(state, state.match.participantIds[0], 1, "blocked-while-locked"); }
  catch (error) { lockFailure = clean(error.code); }
  requireOutcome(lockFailure === "STEP11_SCORING_LOCKED", "PRODUCTION_STEP11_LOCK_REHEARSAL_FAILED");
  const unlocked = setProductionStep11ScoringLock(state, directorMutation(state, "unlock", { locked: false }));
  await recordEvent(state, runToken, "SCORING_UNLOCKED", unlocked.mutationKey, eventEvidence(state));
  const revoked = setProductionStep11ScoringAccess(state, directorMutation(state, "access-revoke", { active: false }));
  await recordEvent(state, runToken, "SCORING_ACCESS_REVOKED", revoked.mutationKey, eventEvidence(state));
  let accessFailure = "";
  try { participantScore(state, state.match.participantIds[0], 1, "blocked-with-revoked-access"); }
  catch (error) { accessFailure = clean(error.code); }
  requireOutcome(accessFailure === "STEP11_SCORING_ACCESS_REVOKED",
    "PRODUCTION_STEP11_ACCESS_REHEARSAL_FAILED");
  const enabled = setProductionStep11ScoringAccess(state, directorMutation(state, "access-enable", { active: true }));
  await recordEvent(state, runToken, "SCORING_ACCESS_ENABLED", enabled.mutationKey, eventEvidence(state));
  let unauthorizedFailure = "";
  try { participantScore(state, "UNAUTHORIZED", 1, "unauthorized-score"); }
  catch (error) { unauthorizedFailure = clean(error.code); }
  requireOutcome(unauthorizedFailure === "STEP11_SCORING_UNAUTHORIZED",
    "PRODUCTION_STEP11_UNAUTHORIZED_REHEARSAL_FAILED");

  let doubleSubmitIdempotent = false;
  for (let hole = 1; hole <= 18; hole += 1) {
    const mutationKey = `score-${hole}`;
    const beforeRevision = state.match.matchRevision;
    const permissionRevision = state.match.permissionRevision;
    const result = participantScore(state, state.match.participantIds[0], hole, mutationKey);
    await recordEvent(state, runToken, "HOLE_SCORE_UPSERTED", result.mutationKey,
      eventEvidence(state, { holeNumber: hole }));
    if (hole === 1) {
      const replay = submitProductionStep11HoleScore(state, {
        actor: state.match.participantIds[0], mutationKey,
        expectedMatchRevision: beforeRevision, expectedHoleRevision: 0,
        permissionRevision,
        payload: { holeNumber: hole, team1GrossScores: [4], team2GrossScores: [5] },
      });
      doubleSubmitIdempotent = replay.idempotent === true;
      requireOutcome(doubleSubmitIdempotent, "PRODUCTION_STEP11_DOUBLE_SUBMIT_REHEARSAL_FAILED");
    }
  }
  let staleRevisionFailure = "";
  try {
    submitProductionStep11HoleScore(state, {
      actor: state.match.participantIds[0], mutationKey: "stale-tab-score",
      expectedMatchRevision: state.match.matchRevision - 1,
      expectedHoleRevision: state.holes["1"].holeRevision,
      permissionRevision: state.match.permissionRevision,
      payload: { holeNumber: 1, team1GrossScores: [5], team2GrossScores: [4] },
    });
  } catch (error) { staleRevisionFailure = clean(error.code); }
  requireOutcome(staleRevisionFailure === "STEP11_MATCH_REVISION_CONFLICT",
    "PRODUCTION_STEP11_STALE_REVISION_REHEARSAL_FAILED");

  const finalized = finalizeProductionStep11Match(state, directorMutation(state, "finalize"));
  await recordEvent(state, runToken, "MATCH_FINALIZED", finalized.mutationKey, eventEvidence(state));
  const finalizeReplay = finalizeProductionStep11Match(state, {
    actor: actorId,
    mutationKey: finalized.mutationKey,
    expectedMatchRevision: finalized.matchRevision - 1,
    payload: {},
  });
  requireOutcome(finalizeReplay.idempotent === true, "PRODUCTION_STEP11_FINALIZE_RETRY_REHEARSAL_FAILED");
  requireOutcome(begunRetry?.idempotent === true, "PRODUCTION_STEP11_BEGIN_RETRY_REHEARSAL_FAILED");

  const mirrorInterrupted = processProductionStep11VirtualWorker(state, {
    queue: "mirror", failAt: "after-external-delivery-before-checkpoint",
  });
  requireOutcome(mirrorInterrupted.ok === false && mirrorInterrupted.retryable === true &&
    mirrorInterrupted.stage === "external-delivered",
  "PRODUCTION_STEP11_MIRROR_INTERRUPTION_REHEARSAL_FAILED");
  await recordEvent(state, runToken, "MIRROR_RETRYABLE", mirrorInterrupted.jobId,
    eventEvidence(state, { stage: mirrorInterrupted.stage }));
  const mirrorRetried = processProductionStep11VirtualWorker(state, { queue: "mirror" });
  requireOutcome(mirrorRetried.ok === true && mirrorRetried.duplicateSuppressed === true,
    "PRODUCTION_STEP11_MIRROR_RETRY_REHEARSAL_FAILED");
  await recordEvent(state, runToken, "MIRROR_CHECKPOINTED", mirrorRetried.jobId,
    eventEvidence(state, { duplicateSuppressed: mirrorRetried.duplicateSuppressed }));
  const archiveInterrupted = processProductionStep11VirtualWorker(state, { queue: "archive", failAt: "after-claim" });
  requireOutcome(archiveInterrupted.ok === false && archiveInterrupted.retryable === true &&
    archiveInterrupted.stage === "claimed",
  "PRODUCTION_STEP11_ARCHIVE_INTERRUPTION_REHEARSAL_FAILED");
  await recordEvent(state, runToken, "ARCHIVE_RETRYABLE", archiveInterrupted.jobId,
    eventEvidence(state, { stage: archiveInterrupted.stage }));
  const archiveRetried = processProductionStep11VirtualWorker(state, { queue: "archive" });
  requireOutcome(archiveRetried.ok === true, "PRODUCTION_STEP11_ARCHIVE_RETRY_REHEARSAL_FAILED");
  await recordEvent(state, runToken, "ARCHIVE_CHECKPOINTED", archiveRetried.jobId,
    eventEvidence(state, { duplicateSuppressed: archiveRetried.duplicateSuppressed }));

  const reopened = reopenProductionStep11Match(state, directorMutation(state, "reopen"));
  await recordEvent(state, runToken, "MATCH_REOPENED", reopened.mutationKey, eventEvidence(state));
  const corrected = participantScore(state, state.match.participantIds[0], 18, "correct-hole-18", {
    team1: [3], team2: [5],
  });
  await recordEvent(state, runToken, "HOLE_SCORE_UPSERTED", corrected.mutationKey,
    eventEvidence(state, { holeNumber: 18, correction: true }));
  const refinalized = finalizeProductionStep11Match(state, directorMutation(state, "refinalize"));
  await recordEvent(state, runToken, "MATCH_FINALIZED", refinalized.mutationKey,
    eventEvidence(state, { refinalized: true }));

  const drain = drainProductionStep11VirtualWorkers(state);
  const reconciliation = rollbackProductionStep11ScoringRehearsal(state, { actor: actorId });
  requireOutcome(reconciliation.unresolved === 0 && reconciliation.duplicates === 0 &&
    reconciliation.lost === 0 &&
    reconciliation.finalSupabaseFingerprint === reconciliation.finalRollbackTargetFingerprint &&
    reconciliation.finalAuthorityState === "GOOGLE" && reconciliation.externalGoogleWrites === 0 &&
    reconciliation.live2026Writes === 0,
  "PRODUCTION_STEP11_ROLLBACK_REHEARSAL_FAILED");
  await recordEvent(state, runToken, "ROLLBACK_RECONCILED", reconciliation.rehearsalAuthorityEpoch,
    { ...reconciliation, tournamentId: state.run.syntheticTournamentId });
  const cleanup = cleanupProductionStep11ScoringRehearsal(state, {
    actor: actorId,
    current2026FingerprintAfter: inspect.current2026Fingerprint,
    s3FingerprintAfter: state.run.s3Fingerprint,
  });
  await recordEvent(state, runToken, "CLEANUP_CERTIFIED", "cleanup",
    { ...cleanup, tournamentId: state.run.syntheticTournamentId });
  const completionInput = scopeInput(environment, runToken, {
    run_id: runId,
    synthetic_tournament_id: state.run.syntheticTournamentId,
    actor_id: actorId,
    s3_fingerprint_after: state.run.s3Fingerprint,
    reconciliation,
  });
  const completed = await rpc("complete_production_step11_scoring_rehearsal", completionInput);
  const completedRetry = await rpc("complete_production_step11_scoring_rehearsal", completionInput);
  requireOutcome(cleanup.certified === true && completed?.ok === true && completed?.status === "CLEANED" &&
    completedRetry?.idempotent === true,
  "PRODUCTION_STEP11_CLEANUP_REHEARSAL_FAILED");

  return {
    ok: true,
    contractVersion: state.contractVersion,
    runId,
    candidateSha: environment.resources.candidateSha,
    candidateHostname: environment.resources.candidateHostname,
    syntheticTournamentId: state.run.syntheticTournamentId,
    source: {
      tournamentId: inspect.fixture.sourceTournamentId,
      tournamentYear: inspect.fixture.sourceTournamentYear,
      matchId: inspect.fixture.sourceMatchId,
      fixtureFingerprint: inspect.fixtureFingerprint,
    },
    authorityEpoch: epoch.epochId,
    writes: reconciliation.supabaseAuthoritativeWrites,
    lifecycle: "FINAL → REOPEN → FINAL",
    lockFailure,
    accessFailure,
    unauthorizedFailure,
    staleRevisionFailure,
    doubleSubmitIdempotent,
    finalizeRetryIdempotent: finalizeReplay.idempotent === true,
    beginRetryIdempotent: begunRetry?.idempotent === true,
    completeRetryIdempotent: completedRetry?.idempotent === true,
    mirrorRetryDuplicateSuppressed: mirrorRetried.duplicateSuppressed === true,
    archiveRetryCompleted: archiveRetried.ok === true,
    virtualWorkerReports: { mirror: drain.mirror.length, archive: drain.archive.length },
    reconciliation,
    cleanup,
    database: {
      begin: begun?.ok === true,
      complete: completed?.ok === true,
      status: completed?.status,
    },
    safety: productionStep11RehearsalSafetyEvidence(state),
  };
}

export async function GET(request) {
  try {
    const state = productionStep11ScoringRehearsalEnvironment(process.env);
    if (!state.allowed) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    assertRequest(request, state);
    return NextResponse.json({
      ok: true,
      contractVersion: state.contractVersion,
      candidateSha: state.resources.candidateSha,
      candidateHostname: state.resources.candidateHostname,
      externalGoogleWrites: 0,
      live2026Writes: 0,
      liveAuthorityUnchanged: true,
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const environment = productionStep11ScoringRehearsalEnvironment(process.env);
    if (!environment.allowed) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    const token = assertRequest(request, environment);
    const body = await request.json().catch(() => ({}));
    if (clean(body?.action).toUpperCase() !== "RUN") {
      return NextResponse.json({ ok: false, code: "PRODUCTION_STEP11_ACTION_REQUIRED" }, { status: 400 });
    }
    return NextResponse.json(await runRehearsal(environment, token));
  } catch (error) { return errorResponse(error); }
}
