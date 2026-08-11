import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { assertScoringShadowAdministrativeEnvironment } from "../../../../lib/scoring-shadow-gate.js";
import { scoringAuthorityEnvironment } from "../../../../lib/scoring-authority.js";
import {
  abortAuthorityEpoch,
  backfillCanonicalFinalMatchLocks,
  buildCanonicalScoringAuthorityImport,
  canonicalAuthorityFingerprint,
  commitAuthorityEpoch,
  completeCanonicalFinalizationParityRepair,
  inspectCanonicalAuthoritySecurity,
  prepareAuthorityEpoch,
  readCanonicalScoringAuthority,
  reconcileCanonicalScoringAuthority,
  repairCanonicalFinalizationParity,
  replaceCanonicalScoringAuthorityImport,
  submitCanonicalHoleScore,
} from "../../../../lib/scoring-authority-supabase.js";
import { benchmarkSummary } from "../../../../lib/scoring-shadow.js";
import { drainGoogleOutbox, inspectGoogleMatchState, processNextGoogleOutboxEvent } from "../../../../lib/scoring-google-outbox.js";
import { inspectPreviewLiveMatchScoringLockMigration, migratePreviewLiveMatchScoringLock, readWorkbookSheetsByName, repairFinalizedLiveMatchParity, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { grossScoresFromCell } from "../../../../lib/live-score-values.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => /^(true|yes|1|locked)$/i.test(clean(value));
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const WORKBOOK_TABS = ["Tournaments", "Players", "Handicaps", "Team Names", "Rounds", "Courses", "Course Holes", "Live Matches", "Matches", "Live Hole Scores"];

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  let shadow;
  try { shadow = assertScoringShadowAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status !== "active") return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 }) };
  return { shadow, identity: authorization.identity };
}

async function authoritativeImport(requestedBy) {
  const startedAt = Date.now();
  const sheets = await readWorkbookSheetsByName(WORKBOOK_TABS);
  const googleReadMs = Date.now() - startedAt;
  const builtAt = Date.now();
  const imported = buildCanonicalScoringAuthorityImport({ sheets, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy });
  return { sheets, imported, googleReadMs, normalizationMs: Date.now() - builtAt };
}

async function currentAndReconcile(imported) {
  const tournamentId = imported.payload.tournament.tournament_id;
  const read = await readCanonicalScoringAuthority({ tournament_id: tournamentId, mode: "CURRENT_STATE" });
  if (!read.payload?.ok) throw new Error(`Canonical authority read failed (${read.payload?.code || "unknown"}).`);
  return { current: read.payload.data, report: reconcileCanonicalScoringAuthority(imported, read.payload.data), readMs: read.durationMs };
}

async function importMain(requestedBy) {
  const source = await authoritativeImport(requestedBy);
  const writeStartedAt = Date.now();
  const write = await replaceCanonicalScoringAuthorityImport(source.imported.payload);
  const writeMs = Date.now() - writeStartedAt;
  if (!write.payload?.ok) throw new Error(`Canonical import failed (${write.payload?.code || "unknown"}).`);
  const reconciled = await currentAndReconcile(source.imported);
  return { ...source, write: write.payload, writeMs, ...reconciled };
}

async function cutoverSnapshot(requestedBy) {
  const source = await authoritativeImport(requestedBy);
  const reconciled = await currentAndReconcile(source.imported);
  const tournamentId = source.imported.payload.tournament.tournament_id;
  const diagnostics = await readCanonicalScoringAuthority({ tournament_id: tournamentId, mode: "DIAGNOSTICS" });
  const security = await inspectCanonicalAuthoritySecurity();
  return { source, ...reconciled, tournamentId, diagnostics: diagnostics.payload?.data || {}, security: security.payload || {} };
}

function requireCutoverSnapshot(snapshot, { ingressState = "OPEN", authority = "GOOGLE", epochId = "" } = {}) {
  const ingress = snapshot.diagnostics?.ingress || {};
  const security = snapshot.security || {};
  const ready = snapshot.report.pass && number(snapshot.diagnostics?.pending_outbox) === 0 &&
    number(ingress.unresolved_client_queues) === 0 && clean(ingress.state).toUpperCase() === ingressState &&
    clean(ingress.authority).toUpperCase() === authority && (!epochId || clean(ingress.active_epoch_id) === clean(epochId)) &&
    number(security.tables) === number(security.rls_enabled) && number(security.policies) === 0 &&
    number(security.participant_rpc_grants) === 0 && number(security.participant_table_grants) === 0;
  if (!ready) throw Object.assign(new Error("The verified cutover preconditions are not satisfied."), {
    code: "CUTOVER_PRECONDITION_FAILED",
    shadowDiagnostics: { code: "CUTOVER_PRECONDITION_FAILED", message: "The verified cutover preconditions are not satisfied.",
      details: JSON.stringify({ reconciliation: snapshot.report, ingress, pendingOutbox: snapshot.diagnostics?.pending_outbox, security }) },
  });
  return true;
}

function epochInput(snapshot, actorId, epochType) {
  return {
    tournament_id: snapshot.tournamentId,
    epoch_type: epochType,
    reconciliation_fingerprint: snapshot.report.fingerprint,
    google_checkpoints: snapshot.current.checkpoints,
    supabase_match_revisions: snapshot.current.matches.map((row) => ({ match_id: row.match_id, revision: row.match_revision })),
    deployment_commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    actor_id: actorId,
    reason: epochType === "CUTOVER" ? "First controlled Preview Supabase authority activation" : "Controlled Preview authority rollback",
  };
}

async function prepareMainCutover(actorId) {
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "google") throw Object.assign(new Error("Preview runtime authority must still be Google before preparing cutover."), { code: "RUNTIME_AUTHORITY_NOT_GOOGLE" });
  const snapshot = await cutoverSnapshot(actorId);
  requireCutoverSnapshot(snapshot);
  const prepared = await prepareAuthorityEpoch(epochInput(snapshot, actorId, "CUTOVER"));
  if (!prepared.payload?.ok) throw Object.assign(new Error(`Cutover prepare failed (${prepared.payload?.code || "unknown"}).`), { code: prepared.payload?.code });
  return { prepared: prepared.payload, counts: snapshot.source.imported.counts, reconciliation: snapshot.report,
    ingressBefore: snapshot.diagnostics.ingress, pendingOutbox: snapshot.diagnostics.pending_outbox,
    security: snapshot.security, deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || "local" };
}

async function commitMainCutover(actorId, epochId) {
  if (!clean(epochId)) throw Object.assign(new Error("A prepared cutover epoch is required."), { code: "EPOCH_REQUIRED" });
  const snapshot = await cutoverSnapshot(actorId);
  requireCutoverSnapshot(snapshot, { ingressState: "PAUSED", authority: "GOOGLE", epochId });
  const committed = await commitAuthorityEpoch({ epoch_id: epochId, actor_id: actorId });
  if (!committed.payload?.ok || committed.payload.authority !== "SUPABASE") {
    throw Object.assign(new Error(`Cutover commit failed (${committed.payload?.code || "unknown"}).`), { code: committed.payload?.code });
  }
  const after = await readCanonicalScoringAuthority({ tournament_id: snapshot.tournamentId, mode: "DIAGNOSTICS" });
  return { committed: committed.payload, reconciliation: snapshot.report, counts: snapshot.source.imported.counts,
    ingressBeforeCommit: snapshot.diagnostics.ingress, ingressAfterCommit: after.payload?.data?.ingress,
    pendingOutbox: after.payload?.data?.pending_outbox, security: snapshot.security };
}

async function prepareMainRollback(actorId) {
  const current = await readCanonicalScoringAuthority({ tournament_id: "2026", mode: "CURRENT_STATE" });
  const diagnostics = await readCanonicalScoringAuthority({ tournament_id: "2026", mode: "DIAGNOSTICS" });
  if (!current.payload?.ok || clean(diagnostics.payload?.data?.authority).toUpperCase() !== "SUPABASE") {
    throw Object.assign(new Error("Supabase is not the current canonical Preview authority."), { code: "SUPABASE_NOT_AUTHORITY" });
  }
  const fingerprint = canonicalAuthorityFingerprint(current.payload.data);
  const prepared = await prepareAuthorityEpoch({ tournament_id: "2026", epoch_type: "ROLLBACK", reconciliation_fingerprint: fingerprint,
    google_checkpoints: current.payload.data.checkpoints,
    supabase_match_revisions: current.payload.data.matches.map((row) => ({ match_id: row.match_id, revision: row.match_revision })),
    deployment_commit: process.env.VERCEL_GIT_COMMIT_SHA || "local", actor_id: actorId, reason: "Controlled Preview authority rollback" });
  if (!prepared.payload?.ok) throw Object.assign(new Error(`Rollback prepare failed (${prepared.payload?.code || "unknown"}).`), { code: prepared.payload?.code });
  return { prepared: prepared.payload, diagnosticsBefore: diagnostics.payload.data, fingerprint };
}

async function commitMainRollback(actorId, epochId) {
  if (!clean(epochId)) throw Object.assign(new Error("A prepared rollback epoch is required."), { code: "EPOCH_REQUIRED" });
  const drained = await drainGoogleOutbox({ maximum: 100, actor: `Phase 2 rollback · ${actorId}` });
  if (!drained.ok) throw Object.assign(new Error("Rollback stopped because Google did not fully verify."), { code: "GOOGLE_OUTBOX_NOT_DRAINED" });
  const snapshot = await cutoverSnapshot(actorId);
  requireCutoverSnapshot(snapshot, { ingressState: "PAUSED", authority: "SUPABASE", epochId });
  const committed = await commitAuthorityEpoch({ epoch_id: epochId, actor_id: actorId });
  if (!committed.payload?.ok || committed.payload.authority !== "GOOGLE") {
    throw Object.assign(new Error(`Rollback commit failed (${committed.payload?.code || "unknown"}).`), { code: committed.payload?.code });
  }
  return { drained, reconciliation: snapshot.report, committed: committed.payload, security: snapshot.security };
}

async function repairFinalizationParity(actorId, matchIdValue) {
  const matchId = clean(matchIdValue);
  if (!matchId) throw Object.assign(new Error("A finalized match is required."), { code: "MATCH_REQUIRED" });
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "supabase") throw Object.assign(new Error("Supabase must be the active Preview scoring authority."), { code: "SUPABASE_NOT_AUTHORITY" });
  const before = await readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" });
  const match = before.payload?.data;
  if (!before.payload?.ok || !match || clean(match.status).toUpperCase() !== "FINAL" || match.scoring_locked !== true) {
    throw Object.assign(new Error("The selected match is not in the canonical locked Final state."), { code: "FINAL_LOCK_REQUIRED" });
  }
  const repairKey = `finalization-parity:${matchId}:R${number(match.match_revision)}`;
  const repaired = await repairCanonicalFinalizationParity({
    environment: "PREVIEW",
    director_authorized: true,
    tournament_id: match.tournament_id,
    match_id: matchId,
    expected_match_revision: number(match.match_revision),
    repair_key: repairKey,
    actor_id: actorId,
  });
  if (!repaired.payload?.ok) throw Object.assign(new Error(`Supabase Final permission repair failed (${repaired.payload?.code || "unknown"}).`), { code: repaired.payload?.code });
  const permissionRevision = number(repaired.payload.permission_revision);
  const google = await withWorkbookWriteDiagnostics("finalization-parity-repair", () => repairFinalizedLiveMatchParity(
    matchId, { permissionRevision }, `Finalization parity repair · ${actorId}`,
  ));
  const googleMatch = google.result?.match || {};
  const googleUpdatedAt = clean(googleMatch["Updated At"] || google.result?.updatedAt);
  const verifiedFingerprint = canonicalAuthorityFingerprint({
    match_id: matchId,
    match_revision: number(match.match_revision),
    permission_revision: permissionRevision,
    status: "FINAL",
    scoring_locked: true,
    access_active: false,
    google_match_updated_at: googleUpdatedAt,
    operation: "FINALIZATION_PARITY_REPAIR",
  });
  const completed = await completeCanonicalFinalizationParityRepair({
    environment: "PREVIEW",
    director_authorized: true,
    tournament_id: match.tournament_id,
    match_id: matchId,
    expected_match_revision: number(match.match_revision),
    repair_key: repairKey,
    actor_id: actorId,
    google_match_updated_at: googleUpdatedAt,
    google_match_revision: number(googleMatch.Revision),
    verified_fingerprint: verifiedFingerprint,
  });
  if (!completed.payload?.ok) throw Object.assign(new Error(`Finalization parity checkpoint failed (${completed.payload?.code || "unknown"}).`), { code: completed.payload?.code });
  const source = await authoritativeImport(actorId);
  const reconciled = await currentAndReconcile(source.imported);
  return {
    matchId,
    matchRevisionBefore: number(match.match_revision),
    matchRevisionAfter: number(repaired.payload.match_revision),
    previousPermissionRevision: number(repaired.payload.previous_permission_revision, permissionRevision),
    permissionRevision,
    supabase: repaired.payload,
    google: {
      status: clean(googleMatch["Match Status"]),
      scoringLocked: truthy(googleMatch["Scoring Locked"]),
      accessActive: truthy(googleMatch["Access Active"]),
      accessVersion: number(googleMatch["Access Version"]),
      updatedAt: googleUpdatedAt,
      changed: Boolean(google.result?.changed),
    },
    checkpoint: completed.payload.checkpoint,
    googleDiagnostics: google.diagnostics,
    reconciliation: reconciled.report,
    counts: source.imported.counts,
  };
}

async function migratePreviewScoringLockSchema(actorId) {
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "supabase") throw Object.assign(new Error("Supabase must remain the active Preview scoring authority."), { code: "SUPABASE_NOT_AUTHORITY" });
  const [diagnostics, matchBefore, security, workbookBefore] = await Promise.all([
    readCanonicalScoringAuthority({ tournament_id: "2026", mode: "DIAGNOSTICS" }),
    readCanonicalScoringAuthority({ match_id: "2026-R3-4", mode: "MATCH" }),
    inspectCanonicalAuthoritySecurity(),
    inspectPreviewLiveMatchScoringLockMigration(),
  ]);
  const ingress = diagnostics.payload?.data?.ingress || {};
  const match = matchBefore.payload?.data;
  const securityState = security.payload || {};
  if (!diagnostics.payload?.ok || clean(ingress.authority).toUpperCase() !== "SUPABASE" || clean(ingress.state).toUpperCase() !== "OPEN"
      || number(diagnostics.payload?.data?.pending_outbox) !== 0) {
    throw Object.assign(new Error("Preview authority ingress or outbox pre-flight is not clean."), { code: "SCHEMA_MIGRATION_PREFLIGHT_FAILED" });
  }
  if (!matchBefore.payload?.ok || clean(match?.status).toUpperCase() !== "FINAL" || match?.scoring_locked !== true || number(match?.match_revision) !== 20) {
    throw Object.assign(new Error("Match 2026-R3-4 is not the verified locked Final revision 20."), { code: "MATCH4_PREFLIGHT_FAILED" });
  }
  if (number(securityState.tables) !== number(securityState.rls_enabled) || number(securityState.policies) !== 0
      || number(securityState.participant_rpc_grants) !== 0 || number(securityState.participant_table_grants) !== 0) {
    throw Object.assign(new Error("Canonical Supabase access posture is not clean."), { code: "SECURITY_PREFLIGHT_FAILED" });
  }
  const migrated = await withWorkbookWriteDiagnostics("preview-live-matches-scoring-locked-schema", () =>
    migratePreviewLiveMatchScoringLock({ expectedFingerprint: workbookBefore.fingerprint }));
  const backfilled = await backfillCanonicalFinalMatchLocks({
    environment: "PREVIEW", director_authorized: true, tournament_id: match.tournament_id, actor_id: actorId,
  });
  if (!backfilled.payload?.ok) throw Object.assign(new Error(`Canonical Final lock backfill failed (${backfilled.payload?.code || "unknown"}).`), { code: backfilled.payload?.code });
  const repaired = await repairFinalizationParity(actorId, "2026-R3-4");
  if (!repaired.reconciliation?.pass) throw Object.assign(new Error("Post-migration reconciliation is not clean."), {
    code: "SCHEMA_MIGRATION_RECONCILIATION_FAILED", shadowDiagnostics: { details: JSON.stringify(repaired.reconciliation) },
  });
  return {
    preflight: { authority: authority.resolved, ingress, pendingOutbox: diagnostics.payload.data.pending_outbox,
      match4: { status: match.status, scoringLocked: match.scoring_locked, matchRevision: match.match_revision },
      security: securityState, workbook: workbookBefore },
    migration: migrated.result,
    googleDiagnostics: migrated.diagnostics,
    canonicalFinalLockBackfill: backfilled.payload,
    match4Repair: repaired,
  };
}

function rehearsalPayload(source, targetMatchId, targetHole) {
  const base = source.payload;
  const tournamentId = `${base.tournament.tournament_id}-PHASE2-REHEARSAL`;
  const matchId = `REHEARSAL-${targetMatchId}`;
  const match = base.matches.find((row) => row.match_id === targetMatchId);
  const snapshot = base.snapshots.find((row) => row.match_id === targetMatchId);
  const snapshotId = `${matchId}:S1`;
  const checkpoint = base.checkpoints.find((row) => row.match_id === targetMatchId);
  const participants = base.match_participants.filter((row) => row.match_id === targetMatchId).map((row) => ({ ...row, match_id: matchId }));
  const permissions = participants.map((row) => ({ match_id: matchId, player_id: row.player_id, can_score: true, permission_revision: 1, revoked_at: "" }));
  const matchHoles = base.match_holes.filter((row) => row.match_id === targetMatchId).map((row) => ({ ...row, match_id: matchId, snapshot_id: snapshotId }));
  const tournamentPlayers = base.tournament_players.map((row) => ({ ...row, tournament_id: tournamentId }));
  const teams = base.teams.map((row) => ({ ...row, tournament_id: tournamentId }));
  const rounds = base.rounds.map((row) => ({ ...row, tournament_id: tournamentId }));
  return {
    environment: "PREVIEW", source_workbook_id: base.source_workbook_id, requested_by: "Phase 2 rehearsal",
    tournament: { tournament_id: tournamentId, tournament_year: number(base.tournament.tournament_year) + 1000,
      name: `${base.tournament.name} Phase 2 Rehearsal` },
    players: base.players, teams, tournament_players: tournamentPlayers, rounds,
    snapshots: [{ ...snapshot, tournament_id: tournamentId, match_id: matchId, snapshot_id: snapshotId, snapshot_revision: 1,
      canonical_hash: canonicalAuthorityFingerprint({ ...snapshot, tournament_id: tournamentId, match_id: matchId, snapshot_id: snapshotId, snapshot_revision: 1 }) }],
    matches: [{ ...match, match_id: matchId, tournament_id: tournamentId, scoring_snapshot_id: snapshotId,
      status: "LIVE", scoring_locked: false, permission_revision: 1, match_revision: 0, source_google_revision: 0,
      scored_holes: 0, current_hole: 0, holes_remaining: 18, team_1_holes_won: 0, team_2_holes_won: 0,
      running_result: "Scheduled", result_winner: "", clinched: false, scorecard_complete: false, finalized_at: "" }],
    match_participants: participants, permissions, match_holes: matchHoles, hole_scores: [],
    checkpoints: [{ match_id: matchId, last_supabase_match_revision: 0,
      google_match_updated_at: checkpoint.google_match_updated_at, google_match_revision: checkpoint.google_match_revision,
      google_hole_revisions: checkpoint.google_hole_revisions,
      verified_fingerprint: canonicalAuthorityFingerprint({ targetMatchId, targetHole, checkpoint }) }],
  };
}

function directorAuthorization(rehearsal, actorId) {
  const match = rehearsal.matches[0];
  return { passport_verified: true, tournament_id: rehearsal.tournament.tournament_id, match_id: match.match_id,
    player_id: actorId, permission_revision: match.permission_revision, role: "DIRECTOR" };
}

async function setupRehearsal(actorId) {
  const source = await authoritativeImport(actorId);
  const holesByMatch = new Map();
  for (const hole of source.imported.payload.hole_scores) {
    if (!holesByMatch.has(hole.match_id)) holesByMatch.set(hole.match_id, []);
    holesByMatch.get(hole.match_id).push(hole);
  }
  const targetMatch = source.imported.payload.matches.find((match) => match.status !== "FINAL" && (holesByMatch.get(match.match_id) || []).length) ||
    source.imported.payload.matches.find((match) => (holesByMatch.get(match.match_id) || []).length);
  if (!targetMatch || targetMatch.status === "FINAL") throw new Error("A writable Preview Google match with an existing score is required for the outbox rehearsal.");
  const targetHole = (holesByMatch.get(targetMatch.match_id) || []).at(-1);
  const google = await inspectGoogleMatchState(targetMatch.match_id);
  const googleMatch = google.match;
  const googleHole = google.holes.find((row) => number(row["Hole Number"]) === targetHole.hole_number);
  if (!googleMatch || !googleHole) throw new Error("The reversible Google rehearsal score was not found.");
  const rehearsal = rehearsalPayload(source.imported, targetMatch.match_id, targetHole.hole_number);
  const checkpoint = rehearsal.checkpoints[0];
  checkpoint.google_match_updated_at = clean(googleMatch["Updated At"]);
  checkpoint.google_match_revision = number(googleMatch.Revision);
  checkpoint.google_hole_revisions[String(targetHole.hole_number)] = number(googleHole.Revision);
  const replaced = await replaceCanonicalScoringAuthorityImport(rehearsal);
  if (!replaced.payload?.ok) throw new Error(`Rehearsal import failed (${replaced.payload?.code || "unknown"}).`);
  return { source, rehearsal, targetMatchId: targetMatch.match_id, targetHole: targetHole.hole_number,
    originalTeam1: grossScoresFromCell(googleHole["Team 1 Gross Scores"]), originalTeam2: grossScoresFromCell(googleHole["Team 2 Gross Scores"]),
    originalGoogleRevision: number(googleHole.Revision), originalGoogleUpdatedAt: clean(googleMatch["Updated At"]) };
}

async function submitRehearsalScore({ setup, team1, team2, matchRevision, holeRevision, actorId, label }) {
  const match = setup.rehearsal.matches[0];
  const startedAt = Date.now();
  const response = await submitCanonicalHoleScore({
    match_id: match.match_id, hole_number: setup.targetHole, team_1_gross_scores: team1, team_2_gross_scores: team2,
    expected_match_revision: matchRevision, expected_hole_revision: holeRevision,
    mutation_key: `phase2-rehearsal:${label}:${randomUUID()}`, google_target_match_id: setup.targetMatchId,
    rehearsal: true, authorization: directorAuthorization(setup.rehearsal, actorId),
  });
  if (!response.payload?.ok) throw new Error(`Rehearsal score failed (${response.payload?.code || "unknown"}).`);
  return { response, committedAt: Date.now(), totalCommitMs: Date.now() - startedAt };
}

const sameScores = (left, right) => JSON.stringify(left || []) === JSON.stringify(right || []);

async function restoreRehearsalGoogleScore(setup, actorId) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const current = await inspectGoogleMatchState(setup.targetMatchId);
      const hole = current.holes.find((row) => number(row["Hole Number"]) === setup.targetHole);
      if (!current.match || !hole) throw new Error("The reversible Google rehearsal score could not be inspected.");
      const team1 = grossScoresFromCell(hole["Team 1 Gross Scores"]);
      const team2 = grossScoresFromCell(hole["Team 2 Gross Scores"]);
      if (sameScores(team1, setup.originalTeam1) && sameScores(team2, setup.originalTeam2)) {
        return { restored: true, writeRequired: false, attempts: attempt, revision: number(hole.Revision) };
      }
      await saveLiveHoleScore(setup.targetMatchId, {
        holeNumber: setup.targetHole,
        team1GrossScores: setup.originalTeam1,
        team2GrossScores: setup.originalTeam2,
        expectedRevision: number(hole.Revision),
        expectedUpdatedAt: clean(current.match["Updated At"]),
        clientMutationId: `phase2-rehearsal-cleanup:${setup.targetMatchId}:${setup.targetHole}:${randomUUID()}`,
      }, `Phase 2 rehearsal cleanup · ${actorId}`);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error("The reversible Google rehearsal score could not be restored.");
}

async function cleanupRehearsal(setup, actorId) {
  const reset = await replaceCanonicalScoringAuthorityImport(setup.rehearsal);
  if (!reset.payload?.ok) throw new Error(`Rehearsal outbox cleanup failed (${reset.payload?.code || "unknown"}).`);
  return restoreRehearsalGoogleScore(setup, actorId);
}

async function outboxRehearsal(actorId, cycles = 5) {
  const setup = await setupRehearsal(actorId);
  const changed = [...setup.originalTeam1];
  changed[0] = changed[0] >= 10 ? changed[0] - 1 : changed[0] + 1;
  let matchRevision = 0; let holeRevision = 0;
  const samples = [];
  let rehearsalError = null;
  try {
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      for (const [kind, team1] of [["change", changed], ["restore", setup.originalTeam1]]) {
        const mutationStartedAt = Date.now();
        const submitted = await submitRehearsalScore({ setup, team1, team2: setup.originalTeam2, matchRevision, holeRevision, actorId, label: `${cycle}:${kind}` });
        matchRevision = number(submitted.response.payload.match_revision);
        holeRevision = number(submitted.response.payload.hole_revision);
        const worker = await processNextGoogleOutboxEvent({ actor: `Phase 2 outbox rehearsal · ${actorId}` });
        if (!worker.ok) throw Object.assign(
          new Error(`Google outbox rehearsal failed at ${worker.errorStage || "unknown"} (${worker.errorCode || "unknown"}): ${worker.errorMessage || "No safe diagnostic was returned."}`),
          { code: worker.errorCode || "GOOGLE_OUTBOX_REHEARSAL_FAILED" },
        );
        samples.push({ cycle, kind, supabaseCommitMs: submitted.totalCommitMs,
          googleDeliveryMs: worker.googleDurationMs, totalMirrorLagMs: Date.now() - mutationStartedAt,
          checkpointRevision: worker.checkpoint?.last_supabase_match_revision });
      }
    }
  } catch (error) { rehearsalError = error; }
  const cleanup = await cleanupRehearsal(setup, actorId);
  const refreshed = await importMain(actorId);
  if (rehearsalError) throw rehearsalError;
  return { setup: { matchId: setup.targetMatchId, hole: setup.targetHole, originalGoogleRevision: setup.originalGoogleRevision,
    finalGoogleRevision: cleanup.revision, cycles }, samples,
    performance: { supabaseCommit: benchmarkSummary(samples.map((row) => row.supabaseCommitMs)),
      googleDelivery: benchmarkSummary(samples.map((row) => row.googleDeliveryMs)), mirrorLag: benchmarkSummary(samples.map((row) => row.totalMirrorLagMs)) },
    restorationPass: cleanup.restored, cleanup, mainParityRestored: refreshed.report.pass, rehearsalTournamentId: setup.rehearsal.tournament.tournament_id };
}

async function outboxFailureRehearsal(actorId) {
  const setup = await setupRehearsal(actorId);
  const match = setup.rehearsal.matches[0];
  const submitted = await submitRehearsalScore({ setup, team1: setup.originalTeam1, team2: setup.originalTeam2,
    matchRevision: 0, holeRevision: 0, actorId, label: "failure-429" });
  const injected429 = await processNextGoogleOutboxEvent({ actor: `Phase 2 failure rehearsal · ${actorId}`,
    dependencies: { saveLiveHoleScore: async () => { const error = new Error("Injected Google 429"); error.status = 429; throw error; } } });
  const immediateDuplicateWorker = await processNextGoogleOutboxEvent({ actor: `Phase 2 duplicate worker · ${actorId}` });
  await new Promise((resolve) => setTimeout(resolve, 2300));
  const recovered = await processNextGoogleOutboxEvent({ actor: `Phase 2 recovery · ${actorId}` });
  const diagnostics = await readCanonicalScoringAuthority({ tournament_id: setup.rehearsal.tournament.tournament_id, mode: "DIAGNOSTICS" });
  const refreshed = await importMain(actorId);
  return {
    injected429, immediateDuplicateWorkerEmpty: Boolean(immediateDuplicateWorker.empty), recovered,
    pendingAfterRecovery: diagnostics.payload?.data?.pending_outbox,
    supabaseStateIntact: submitted.response.payload.ok && number(submitted.response.payload.match_revision) === 1,
    mainParityRestored: refreshed.report.pass,
    pass: !injected429.ok && injected429.errorCode === "429" && immediateDuplicateWorker.empty && recovered.ok && number(diagnostics.payload?.data?.pending_outbox) === 0 && refreshed.report.pass,
  };
}

async function cutoverRollbackRehearsal(actorId) {
  const setup = await setupRehearsal(actorId);
  const tournamentId = setup.rehearsal.tournament.tournament_id;
  const state = await readCanonicalScoringAuthority({ tournament_id: tournamentId, mode: "CURRENT_STATE" });
  const fingerprint = canonicalAuthorityFingerprint(state.payload.data);
  const epochInput = { tournament_id: tournamentId, epoch_type: "CUTOVER", reconciliation_fingerprint: fingerprint,
    google_checkpoints: state.payload.data.checkpoints, supabase_match_revisions: state.payload.data.matches.map((row) => ({ match_id: row.match_id, revision: row.match_revision })),
    deployment_commit: process.env.VERCEL_GIT_COMMIT_SHA || "local", actor_id: actorId, reason: "Isolated Phase 2 rehearsal" };
  const preparedCutover = await prepareAuthorityEpoch(epochInput);
  if (!preparedCutover.payload?.ok) throw new Error(`Cutover rehearsal prepare failed (${preparedCutover.payload?.code}).`);
  const committedCutover = await commitAuthorityEpoch({ epoch_id: preparedCutover.payload.epoch_id, actor_id: actorId });
  if (!committedCutover.payload?.ok || committedCutover.payload.authority !== "SUPABASE") throw new Error("Cutover rehearsal commit failed.");
  const pending = await submitRehearsalScore({ setup, team1: setup.originalTeam1, team2: setup.originalTeam2,
    matchRevision: 0, holeRevision: 0, actorId, label: "rollback-gate" });
  const preparedRollback = await prepareAuthorityEpoch({ ...epochInput, epoch_type: "ROLLBACK",
    supabase_match_revisions: [{ match_id: setup.rehearsal.matches[0].match_id, revision: pending.response.payload.match_revision }] });
  if (!preparedRollback.payload?.ok) throw new Error(`Rollback rehearsal prepare failed (${preparedRollback.payload?.code}).`);
  const blockedRollback = await commitAuthorityEpoch({ epoch_id: preparedRollback.payload.epoch_id, actor_id: actorId });
  const drained = await drainGoogleOutbox({ maximum: 5, actor: `Phase 2 rollback rehearsal · ${actorId}` });
  if (!drained.ok) throw new Error("Rollback rehearsal could not drain Google outbox.");
  const committedRollback = await commitAuthorityEpoch({ epoch_id: preparedRollback.payload.epoch_id, actor_id: actorId });
  const refreshed = await importMain(actorId);
  return { preparedCutover: preparedCutover.payload, committedCutover: committedCutover.payload,
    blockedRollback: blockedRollback.payload, drained, preparedRollback: preparedRollback.payload,
    committedRollback: committedRollback.payload, mainParityRestored: refreshed.report.pass,
    pass: committedCutover.payload.authority === "SUPABASE" && preparedRollback.payload.ingress === "PAUSED" && blockedRollback.payload.code === "GOOGLE_OUTBOX_NOT_DRAINED" &&
      drained.ok && committedRollback.payload.authority === "GOOGLE" && refreshed.report.pass };
}

async function preflight(context) {
  const authority = scoringAuthorityEnvironment();
  const security = await inspectCanonicalAuthoritySecurity().catch(() => null);
  return {
    environment: process.env.VERCEL_ENV,
    previewWorkbook: context.shadow.previewWorkbook,
    productionIsolated: context.shadow.previewWorkbook,
    scoringEnvironment: process.env.SCORING_ENVIRONMENT || "test",
    scoringEnabled: process.env.SCORING_ENABLED !== "false",
    configuredAuthority: authority.requested,
    resolvedAuthority: authority.resolved,
    supabaseProjectRefMatches: clean(process.env.SUPABASE_SCORING_MIRROR_URL).includes("idgigvjjqkfbqjeredpb"),
    security: security?.payload || null,
    director: clean(context.identity?.name || context.identity?.player?.name || "authenticated Director"),
  };
}

export async function POST(request) {
  const context = await authorize(request);
  if (context.response) return context.response;
  const actorId = clean(context.identity?.player?.id || context.identity?.id || context.identity?.name || "authenticated Director");
  const startedAt = Date.now();
  try {
    const input = await request.json().catch(() => ({}));
    const action = clean(input.action);
    let result;
    if (action === "preflight") result = await preflight(context);
    else if (action === "import") {
      const imported = await importMain(actorId);
      result = { counts: imported.imported.counts, fingerprint: imported.imported.fingerprint,
        googleReadMs: imported.googleReadMs, normalizationMs: imported.normalizationMs, supabaseImportMs: imported.writeMs,
        supabaseReadMs: imported.readMs, import: imported.write, reconciliation: imported.report };
    } else if (action === "reconcile") {
      const source = await authoritativeImport(actorId);
      const reconciled = await currentAndReconcile(source.imported);
      result = { counts: source.imported.counts, googleReadMs: source.googleReadMs, normalizationMs: source.normalizationMs,
        supabaseReadMs: reconciled.readMs, reconciliation: reconciled.report };
    } else if (action === "repair-finalization-parity") {
      result = await repairFinalizationParity(actorId, input.matchId);
    } else if (action === "migrate-preview-scoring-lock-schema") {
      result = await migratePreviewScoringLockSchema(actorId);
    } else if (action === "outbox-rehearsal") result = await outboxRehearsal(actorId, number(input.cycles, 5));
    else if (action === "outbox-failures") result = await outboxFailureRehearsal(actorId);
    else if (action === "cutover-rollback-rehearsal") result = await cutoverRollbackRehearsal(actorId);
    else if (action === "prepare-cutover") result = await prepareMainCutover(actorId);
    else if (action === "commit-cutover") result = await commitMainCutover(actorId, clean(input.epochId));
    else if (action === "prepare-rollback") result = await prepareMainRollback(actorId);
    else if (action === "commit-rollback") result = await commitMainRollback(actorId, clean(input.epochId));
    else if (action === "readiness") {
      const source = await authoritativeImport(actorId);
      const reconciled = await currentAndReconcile(source.imported);
      const diagnostics = await readCanonicalScoringAuthority({ tournament_id: source.imported.payload.tournament.tournament_id, mode: "DIAGNOSTICS" });
      result = { preflight: await preflight(context), counts: source.imported.counts, reconciliation: reconciled.report,
        diagnostics: diagnostics.payload?.data,
        ready: scoringAuthorityEnvironment().resolved === "google" && reconciled.report.pass && !number(diagnostics.payload?.data?.pending_outbox) };
    } else return NextResponse.json({ error: "Unsupported Phase 2 authority action." }, { status: 400 });
    return NextResponse.json({ ok: true, action, requestMs: Date.now() - startedAt, result });
  } catch (error) {
    console.error("Phase 2 authority rehearsal failed", { message: error?.message, code: error?.code || "" });
    const diagnostics = error?.shadowDiagnostics || {};
    return NextResponse.json({
      error: clean(diagnostics.message || error?.message || "Phase 2 authority rehearsal failed."),
      code: clean(diagnostics.code || error?.code),
      diagnostics: {
        status: Number(error?.status) || 0,
        path: clean(diagnostics.path),
        details: clean(diagnostics.details),
        hint: clean(diagnostics.hint),
      },
    }, { status: 503 });
  }
}
