import { randomUUID } from "node:crypto";
import {
  claimScorecardArchiveJob,
  completeScorecardArchiveJob,
  failScorecardArchiveJob,
  inspectScorecardArchiveState,
} from "./scoring-authority-supabase.js";
import {
  inspectRoundScorecardsArchiveReadback,
  invalidateRoundScorecardsArchive,
  upsertRoundScorecardsArchive,
  withWorkbookWriteDiagnostics,
} from "./google-sheets-write.js";
import {
  buildRoundScorecardsArchiveRows,
  roundScorecardFormula,
  roundScorecardsArchiveEnvironment,
  verifyRoundScorecardsArchiveReadback,
} from "./round-scorecards-archive.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const retrySeconds = (attempts) => Math.min(900, Math.max(2, 2 ** Math.min(number(attempts), 9)));

export function scorecardArchiveFailureCode(error) {
  const message = clean(error?.message);
  const explicit = clean(error?.code || error?.status);
  if (explicit && explicit !== "Error") return explicit;
  const httpStatus = message.match(/Google Sheets (?:archive )?request failed \((\d{3})\)/i)?.[1];
  if (httpStatus) return `GOOGLE_SHEETS_HTTP_${httpStatus}`;
  if (/write credentials are not configured/i.test(message)) return "GOOGLE_SHEETS_CREDENTIALS_MISSING";
  if (/Live scoring writes are disabled/i.test(message)) return "ARCHIVE_WRITE_ENVIRONMENT_BLOCKED";
  if (/separate test GOOGLE_SHEETS_ID|preview-only GOOGLE_SHEETS_ID/i.test(message)) return "PREVIEW_WORKBOOK_ISOLATION_BLOCKED";
  if (/schema is missing required sheet/i.test(message)) return "ROUND_SCORECARDS_SHEET_MISSING";
  if (/columns are not in the canonical protected order|schema mismatch/i.test(message)) return "ROUND_SCORECARDS_SCHEMA_MISMATCH";
  if (/noncanonical protected Match ID formula|protected Match ID value/i.test(message)) return "ROUND_SCORECARDS_FORMULA_CONFLICT";
  if (/No safe physical Round Scorecards row/i.test(message)) return "ROUND_SCORECARDS_CAPACITY_EXHAUSTED";
  if (/readback/i.test(message)) return "ARCHIVE_READBACK_MISMATCH";
  return "ARCHIVE_DELIVERY_FAILED";
}

export function scorecardArchiveJobInput(job = {}, snapshot = null) {
  const eventType = clean(job.event_type);
  if (!["SCORECARD_ARCHIVE_UPSERT", "SCORECARD_ARCHIVE_INVALIDATE"].includes(eventType)) {
    throw Object.assign(new Error(`Unsupported scorecard archive event: ${eventType || "blank"}.`), { code: "ARCHIVE_EVENT_UNSUPPORTED" });
  }
  if (!clean(job.id) || !clean(job.claim_token) || !clean(job.match_id)) {
    throw Object.assign(new Error("A claimed archive job requires its identity, claim token, and Match ID."), { code: "ARCHIVE_CLAIM_INVALID" });
  }
  if (!snapshot?.payload) throw Object.assign(new Error("The claimed archive job is missing its finalized snapshot."), { code: "ARCHIVE_SNAPSHOT_MISSING" });
  return {
    jobId: clean(job.id),
    claimToken: clean(job.claim_token),
    eventType,
    matchId: clean(job.match_id),
    matchRevision: number(job.match_revision),
    snapshotId: clean(snapshot.snapshot_id),
    snapshotRevision: number(snapshot.snapshot_revision),
    sourceFingerprint: clean(job.source_fingerprint || snapshot.source_fingerprint),
    payloadHash: clean(job.archive_payload_hash || snapshot.payload_hash),
    snapshot,
  };
}

export async function processNextScorecardArchiveJob({
  workerId = `preview-archive-${randomUUID()}`,
  env = process.env,
  dependencies = {},
} = {}) {
  const gate = (dependencies.roundScorecardsArchiveEnvironment || roundScorecardsArchiveEnvironment)(env);
  if (!gate.enabled) return { ok: false, empty: true, disabled: true, reason: gate.reason };
  const claim = await (dependencies.claimScorecardArchiveJob || claimScorecardArchiveJob)(workerId, { leaseSeconds: 90, env });
  const job = claim.payload?.job;
  if (!job) return { ok: true, empty: true };
  let input;
  try {
    input = scorecardArchiveJobInput(job, claim.payload?.snapshot);
  } catch (error) {
    await (dependencies.failScorecardArchiveJob || failScorecardArchiveJob)({
      job_id: job.id,
      claim_token: job.claim_token,
      error_code: clean(error.code || "ARCHIVE_CLAIM_INVALID"),
      error_safe: "The archive job payload is incomplete and requires service review.",
      retry_after_seconds: 900,
      block: true,
    }, { env }).catch(() => {});
    return { ok: false, empty: false, jobId: clean(job.id), errorCode: clean(error.code), errorStage: "claim-validation" };
  }
  const startedAt = Date.now();
  let stage = "google-writer";
  try {
    const measure = dependencies.measure || withWorkbookWriteDiagnostics;
    const measured = await measure("round-scorecards-archive", async () => {
      stage = "google-writer";
      const deliver = input.eventType === "SCORECARD_ARCHIVE_INVALIDATE"
        ? (dependencies.invalidateRoundScorecardsArchive || invalidateRoundScorecardsArchive)
        : (dependencies.upsertRoundScorecardsArchive || upsertRoundScorecardsArchive);
      return deliver(input.snapshot, { expectedPayloadHash: input.payloadHash, env });
    });
    const verification = measured.result;
    if (!verification?.pass) throw Object.assign(new Error("Round Scorecards fresh readback did not verify."), { code: "ARCHIVE_READBACK_MISMATCH" });
    stage = "checkpoint";
    const completion = await (dependencies.completeScorecardArchiveJob || completeScorecardArchiveJob)({
      job_id: input.jobId,
      claim_token: input.claimToken,
      snapshot_id: input.snapshotId,
      snapshot_revision: input.snapshotRevision,
      finalized_match_revision: input.matchRevision,
      source_fingerprint: input.sourceFingerprint,
      archive_payload_hash: input.payloadHash,
      expected_logical_identities: verification.expectedIdentities,
      google_readback_hash: verification.readbackHash,
      google_row_numbers: verification.rows.map((row) => row.rowNumber),
      verified_status: input.eventType === "SCORECARD_ARCHIVE_INVALIDATE" ? "INVALIDATED" : "VERIFIED",
    }, { env });
    if (!completion.payload?.ok) {
      throw Object.assign(new Error(`Archive checkpoint failed: ${completion.payload?.code || "unknown"}.`), { code: completion.payload?.code || "ARCHIVE_CHECKPOINT_FAILED" });
    }
    return {
      ok: true,
      empty: false,
      jobId: input.jobId,
      eventType: input.eventType,
      matchId: input.matchId,
      matchRevision: input.matchRevision,
      snapshotRevision: input.snapshotRevision,
      rowCount: verification.actualRowCount,
      readbackHash: verification.readbackHash,
      durationMs: Date.now() - startedAt,
      googleDiagnostics: measured.diagnostics || {},
      checkpoint: completion.payload.checkpoint,
    };
  } catch (error) {
    const failureCode = scorecardArchiveFailureCode(error);
    await (dependencies.failScorecardArchiveJob || failScorecardArchiveJob)({
      job_id: input.jobId,
      claim_token: input.claimToken,
      error_code: failureCode,
      error_safe: "Round Scorecards archive delivery did not verify and will retry.",
      retry_after_seconds: retrySeconds(job.attempts),
      block: false,
    }, { env }).catch(() => {});
    return {
      ok: false,
      empty: false,
      jobId: input.jobId,
      matchId: input.matchId,
      matchRevision: input.matchRevision,
      durationMs: Date.now() - startedAt,
      errorCode: failureCode,
      errorStage: stage,
      errorMessage: clean(error?.message || "Round Scorecards archive delivery did not verify."),
    };
  }
}

export async function drainScorecardArchiveJobs({ maximum = 25, stopOnFailure = false, ...options } = {}) {
  const startedAt = Date.now();
  const deliveries = [];
  for (let index = 0; index < Math.max(1, Math.min(number(maximum, 25), 100)); index += 1) {
    const delivery = await processNextScorecardArchiveJob(options);
    if (delivery.empty) break;
    deliveries.push(delivery);
    if (!delivery.ok && stopOnFailure) break;
  }
  return {
    ok: deliveries.every((delivery) => delivery.ok),
    delivered: deliveries.filter((delivery) => delivery.ok).length,
    failed: deliveries.filter((delivery) => !delivery.ok).length,
    deliveries,
    durationMs: Date.now() - startedAt,
  };
}

export async function reconcileRoundScorecardsArchives({
  tournamentId = "2026",
  evidenceMatchIds = ["2026-R3-4", "2026-R2-1", "2026-R1-6"],
  env = process.env,
  dependencies = {},
} = {}) {
  const gate = (dependencies.roundScorecardsArchiveEnvironment || roundScorecardsArchiveEnvironment)(env);
  if (!gate.enabled) return { ok: false, disabled: true, reason: gate.reason };
  const inspected = await (dependencies.inspectScorecardArchiveState || inspectScorecardArchiveState)({
    tournament_id: clean(tournamentId),
  }, { env });
  const state = inspected.payload || {};
  const snapshots = (state.snapshots || []).filter((item) => item.state === "CURRENT");
  const expectedByMatch = new Map(snapshots.map((item) => [
    clean(item.match_id || item.payload?.match?.match_id),
    buildRoundScorecardsArchiveRows(item),
  ]));
  const grid = await (dependencies.inspectRoundScorecardsArchiveReadback || inspectRoundScorecardsArchiveReadback)();
  const reports = [];
  const allActualRows = grid.rows.filter((row) => !row.writableBlank);
  for (const [matchId, expectedRows] of expectedByMatch) {
    const actualRows = allActualRows.filter((row) => clean(row.record["Match ID"]) === matchId);
    const expectedFormulas = Object.fromEntries(actualRows.map((row) => [row.rowNumber, roundScorecardFormula(row.rowNumber)]));
    reports.push({
      matchId,
      ...verifyRoundScorecardsArchiveReadback({ expectedRows, actualRows, expectedFormulas }),
    });
  }
  const expectedLogicalRows = reports.reduce((sum, item) => sum + item.expectedRowCount, 0);
  const actualLogicalRows = reports.reduce((sum, item) => sum + item.actualRowCount, 0);
  const expectedHoleValues = expectedLogicalRows * 18;
  const actualHoleValues = reports.reduce((sum, report) => sum + report.rows.reduce((rowSum, row) => rowSum +
    Array.from({ length: 18 }, (_, index) => {
      const value = row.record[`Hole ${index + 1}`];
      return clean(value) !== "" && Number.isInteger(Number(value)) ? 1 : 0;
    }).reduce((left, right) => left + right, 0), 0), 0);
  const jobs = state.jobs || [];
  const checkpoints = state.checkpoints || [];
  const currentSnapshotIds = new Set(snapshots.map((item) => clean(item.snapshot_id)));
  const unverifiedCheckpoints = checkpoints.filter((item) => currentSnapshotIds.has(clean(item.current_snapshot_id)) && item.status !== "VERIFIED");
  const pendingJobs = jobs.filter((item) => ["PENDING", "PROCESSING", "RETRYABLE"].includes(item.status));
  const failedJobs = jobs.filter((item) => item.status === "BLOCKED");
  const formulaFailures = reports.flatMap((report) => report.mismatches.filter((item) => item.field === "Match ID formula").map((item) => ({ matchId: report.matchId, ...item })));
  const fieldDivergences = reports.flatMap((report) => report.mismatches.filter((item) => item.field !== "Match ID formula").map((item) => ({ matchId: report.matchId, ...item })));
  const duplicateIdentities = reports.flatMap((report) => report.duplicates.map((identity) => ({ matchId: report.matchId, identity })));
  const missingIdentities = reports.flatMap((report) => report.missing.map((identity) => ({ matchId: report.matchId, identity })));
  const unexpectedIdentities = reports.flatMap((report) => report.unexpected.map((identity) => ({ matchId: report.matchId, identity })));
  const evidence = Object.fromEntries(evidenceMatchIds.map((matchId) => {
    const report = reports.find((item) => item.matchId === matchId);
    return [matchId, report ? {
      pass: report.pass,
      expectedRows: report.expectedRowCount,
      actualRows: report.actualRowCount,
      expectedIdentities: report.expectedIdentities,
      rows: report.rows.map((row) => ({
        identity: row.identity,
        rowNumber: row.rowNumber,
        formula: row.formula,
        playerId: clean(row.record["Player ID"]),
        teamId: clean(row.record["Team ID"]),
        scoreType: clean(row.record["Score Type"]),
        source: clean(row.record.Source),
        scorecardStatus: clean(row.record["Scorecard Status"]),
        gross: Array.from({ length: 18 }, (_, index) => Number(row.record[`Hole ${index + 1}`])),
      })),
      mismatches: report.mismatches,
    } : { pass: false, code: "CURRENT_SNAPSHOT_MISSING" }];
  }));
  const ok = snapshots.length > 0 && reports.every((item) => item.pass) &&
    expectedLogicalRows === actualLogicalRows && expectedHoleValues === actualHoleValues &&
    !pendingJobs.length && !failedJobs.length && !unverifiedCheckpoints.length;
  return {
    ok,
    tournamentId: clean(tournamentId),
    finalSnapshots: snapshots.length,
    expectedLogicalRows,
    actualLogicalRows,
    expectedHoleValues,
    actualHoleValues,
    missingIdentities,
    duplicateIdentities,
    unexpectedIdentities,
    formulaFailures,
    fieldDivergences,
    pendingJobs: pendingJobs.length,
    failedJobs: failedJobs.length,
    verifiedCheckpoints: checkpoints.filter((item) => item.status === "VERIFIED").length,
    unverifiedCheckpoints: unverifiedCheckpoints.length,
    reports,
    evidence,
  };
}
