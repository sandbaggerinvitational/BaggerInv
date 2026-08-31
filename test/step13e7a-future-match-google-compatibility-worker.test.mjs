import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  futureMatchGoogleCompatibilityLiveMatchIdValue,
  futureMatchGoogleCompatibilityManifestFingerprint,
  futureMatchGoogleCompatibilityPostgresJsonbText,
  futureMatchGoogleCompatibilityProjection,
} from "../lib/google-sheets-write.js";
import { COLUMN_PURPOSE, columnPurpose } from "../lib/workbook-protection.js";
import {
  drainFutureMatchGoogleCompatibility,
  futureMatchGoogleCompatibilityJobInput,
  processNextFutureMatchGoogleCompatibility,
} from "../lib/future-match-google-compatibility-worker.js";

const manifest = Object.freeze({
  contractVersion: "production-future-google-match-provisioning-v2",
  tournamentId: "2027",
  tournamentYear: 2027,
  matchId: "2027-R1-1",
  writerGenerationId: "8be8669d-cff6-4f6d-9c73-9adac3739771",
  destinationWorkbookId: "annual-workbook-2027",
  targetContractFingerprint: "b".repeat(64),
  structuralFingerprint: "c".repeat(64),
  runtimeRevision: 4,
  templateLiveMatchId: "2026-R1-1",
  templateArchiveMatchId: "2026-R1-1",
  liveMatch: {
    Year: 2027, Round: 1, Format: "BB", Match: 1,
    "Course ID": "OCGC01", "Tee Time": "08:00", "Starting Hole": 1,
    "Team 1 Player 1": "AA01", "Team 1 Player 2": "AA02",
    "Team 2 Player 1": "BB01", "Team 2 Player 2": "BB02",
  },
  archiveMatch: {
    Year: 2027, Round: 1, Format: "BB", Match: 1,
    "Course ID": "OCGC01", "Tee Time": "08:00", "Starting Hole": 1,
    "Team 1 Player 1": "AA01", "Team 1 Player 2": "AA02",
    "Team 2 Player 1": "BB01", "Team 2 Player 2": "BB02",
  },
});

const job = Object.freeze({
  jobId: "47be13da-f522-4fc5-82a8-7234494af131",
  claimToken: "d2ef2b67-3d92-4baa-9b39-271393f2bc27",
  tournamentId: "2027",
  matchId: "2027-R1-1",
  attempt: 1,
  expectedManifestFingerprint: futureMatchGoogleCompatibilityManifestFingerprint(manifest),
  sourceWorkbookId: manifest.destinationWorkbookId,
  writerGenerationId: manifest.writerGenerationId,
  destinationWorkbookId: manifest.destinationWorkbookId,
  targetContractFingerprint: manifest.targetContractFingerprint,
  structuralFingerprint: manifest.structuralFingerprint,
  runtimeRevision: manifest.runtimeRevision,
  manifest,
});

const writerContext = Object.freeze({
  contractVersion: "production-future-google-match-provisioning-v2",
  targetTournamentId: manifest.tournamentId,
  tournamentYear: manifest.tournamentYear,
  writerGenerationId: manifest.writerGenerationId,
  destinationWorkbookId: manifest.destinationWorkbookId,
  targetContractFingerprint: manifest.targetContractFingerprint,
  implementationFingerprint: "d".repeat(64),
  nonAuthoritative: true,
  rollbackAllowed: false,
});

const resolveWriterContext = async () => writerContext;
const writerResources = () => ({
  environment: "PRODUCTION",
  tournamentId: manifest.tournamentId,
  tournamentYear: manifest.tournamentYear,
  googleWorkbookId: manifest.destinationWorkbookId,
  futureGoogleWriterContext: writerContext,
});

function verifiedDelivery(overrides = {}) {
  const projection = futureMatchGoogleCompatibilityProjection(manifest);
  return {
    pass: true,
    idempotent: false,
    contractVersion: projection.contractVersion,
    tournamentId: projection.tournamentId,
    matchId: projection.matchId,
    manifestFingerprint: projection.manifestFingerprint,
    writerGenerationId: projection.writerGenerationId,
    destinationWorkbookId: projection.destinationWorkbookId,
    targetContractFingerprint: projection.targetContractFingerprint,
    structuralFingerprint: projection.structuralFingerprint,
    runtimeRevision: projection.runtimeRevision,
    googleReadbackFingerprint: "a".repeat(64),
    liveMatches: { rowNumber: 40, formulaFields: ["Team 1 Player 1 Stroke"] },
    matches: { rowNumber: 40, formulaFields: ["Match ID"] },
    ...overrides,
  };
}

test("future match projection contains configuration and dormant control only", () => {
  const projection = futureMatchGoogleCompatibilityProjection(manifest);
  assert.equal(projection.contractVersion, "production-future-match-google-compatibility-v2");
  assert.equal(projection.matchId, "2027-R1-1");
  assert.equal(projection.liveMatch["Team 1 Player 2"], "AA02");
  assert.equal(projection.writerGenerationId, manifest.writerGenerationId);
  assert.equal(projection.destinationWorkbookId, manifest.destinationWorkbookId);
  assert.equal(projection.structuralFingerprint, manifest.structuralFingerprint);
  assert.equal(projection.runtimeRevision, manifest.runtimeRevision);
  for (const field of [
    "Matchup Winner", "Team 1 Points", "Final Result", "Finalized At",
    "Match Status", "Scoring Locked", "Access Active", "Access Version",
    "Access Code Hash", "Access Token Hash", "Access Selector",
  ]) {
    assert.equal(Object.hasOwn(projection.liveMatch, field), false, field);
    assert.equal(Object.hasOwn(projection.archiveMatch, field), false, field);
  }
  assert.match(projection.manifestFingerprint, /^[0-9a-f]{64}$/);
});

test("compatibility fingerprints match the PostgreSQL jsonb::text hash contract", async () => {
  const sample = { long_key: "value", b: [true, { zz: 2, a: null }], aa: 1 };
  const postgresText = '{"b": [true, {"a": null, "zz": 2}], "aa": 1, "long_key": "value"}';
  assert.equal(futureMatchGoogleCompatibilityPostgresJsonbText(sample), postgresText);
  const projection = futureMatchGoogleCompatibilityProjection(manifest);
  const { manifestFingerprint, ...evidence } = projection;
  assert.equal(
    manifestFingerprint,
    createHash("sha256")
      .update(futureMatchGoogleCompatibilityPostgresJsonbText(evidence))
      .digest("hex"),
  );
  const migration = await readFile(new URL(
    "../supabase/production_migrations/202608300066_production_future_runtime_activation_v1.sql",
    import.meta.url,
  ), "utf8");
  assert.match(migration, /future_runtime_hash_v2\(value jsonb\)[\s\S]*digest\(value::text, 'sha256'\)/);
});

test("Live Matches Match ID seeding is exact-blank-only and never overwrites", () => {
  assert.equal(
    futureMatchGoogleCompatibilityLiveMatchIdValue("", "2027-R1-1"),
    "2027-R1-1",
  );
  assert.equal(columnPurpose("Live Matches", "Match ID"), COLUMN_PURPOSE.READ_ONLY);
  assert.equal(columnPurpose("Matches", "Match ID"), COLUMN_PURPOSE.FORMULA);
  for (const occupied of [" ", "-R-", "2026-R1-1", "2027-R1-1", "=A2&B2"]) {
    assert.throws(
      () => futureMatchGoogleCompatibilityLiveMatchIdValue(occupied, "2027-R1-1"),
      (error) => error.code === "FUTURE_MATCH_GOOGLE_COMPATIBILITY_MATCH_ID_NOT_BLANK",
    );
  }
});

test("projection rejects inconsistent IDs, duplicate pairings, and missing certified templates", () => {
  assert.throws(() => futureMatchGoogleCompatibilityProjection({
    ...manifest,
    matchId: "2027-R1-2",
  }), (error) => error.code === "FUTURE_MATCH_GOOGLE_COMPATIBILITY_MATCH_ID_INVALID");
  assert.throws(() => futureMatchGoogleCompatibilityProjection({
    ...manifest,
    liveMatch: { ...manifest.liveMatch, "Team 2 Player 2": "AA01" },
  }), (error) => error.code === "FUTURE_MATCH_GOOGLE_COMPATIBILITY_PAIRING_INVALID");
  assert.throws(() => futureMatchGoogleCompatibilityProjection({
    ...manifest,
    templateLiveMatchId: "",
    templateArchiveMatchId: "",
  }), (error) => error.code === "FUTURE_MATCH_GOOGLE_COMPATIBILITY_TEMPLATE_REQUIRED");
});

test("claimed job is exact-scope bound before any Google writer can run", () => {
  const input = futureMatchGoogleCompatibilityJobInput(job);
  assert.equal(input.tournamentId, "2027");
  assert.equal(input.matchId, "2027-R1-1");
  assert.equal(input.writerGenerationId, manifest.writerGenerationId);
  assert.equal(input.destinationWorkbookId, manifest.destinationWorkbookId);
  assert.throws(() => futureMatchGoogleCompatibilityJobInput({
    ...job,
    tournamentId: "2028",
  }), (error) => error.code === "FUTURE_MATCH_GOOGLE_COMPATIBILITY_SCOPE_MISMATCH");
  assert.throws(() => futureMatchGoogleCompatibilityJobInput({
    ...job,
    expectedManifestFingerprint: "b".repeat(64),
  }), (error) => error.code === "FUTURE_MATCH_GOOGLE_COMPATIBILITY_MANIFEST_FINGERPRINT_MISMATCH");
});

test("worker uses the dedicated Production credential and checkpoints exact readback", async () => {
  let credentialOptions;
  let completed;
  let failed = false;
  const result = await processNextFutureMatchGoogleCompatibility({
    workerId: "worker-1",
    env: { VERCEL_ENV: "production" },
    dependencies: {
      resolveFutureMatchGoogleCompatibilityContext: resolveWriterContext,
      productionFutureGoogleWriterResources: writerResources,
      claimFutureMatchGoogleCompatibility: async () => ({ payload: { job } }),
      withProductionGoogleServiceAccountCredentials: async (options, callback) => {
        credentialOptions = options;
        return callback();
      },
      measure: async (_label, callback) => ({ result: await callback(), diagnostics: { workbookWrites: 2 } }),
      provisionFutureMatchGoogleCompatibility: async () => verifiedDelivery(),
      completeFutureMatchGoogleCompatibility: async (input) => {
        completed = input;
        return { payload: { ok: true, checkpoint: { status: "CERTIFIED" } } };
      },
      failFutureMatchGoogleCompatibility: async () => { failed = true; },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.matchId, "2027-R1-1");
  assert.equal(failed, false);
  assert.equal(credentialOptions.operation, "FUTURE_MATCH_GOOGLE_COMPATIBILITY");
  assert.equal(completed.job_id, job.jobId);
  assert.equal(completed.claim_token, job.claimToken);
  assert.equal(completed.target_tournament_id, "2027");
  assert.equal(completed.expected_manifest_fingerprint, job.expectedManifestFingerprint);
  assert.equal(completed.expected_structural_fingerprint, manifest.structuralFingerprint);
  assert.equal(completed.readback_fingerprint, "a".repeat(64));
  assert.equal(completed.readback_checkpoint.liveMatchVerified, true);
  assert.equal(completed.readback_checkpoint.archiveMatchVerified, true);
  assert.equal(completed.readback_checkpoint.liveMatchesRowNumber, 40);
  assert.equal(completed.readback_checkpoint.matchesRowNumber, 40);
  assert.equal(completed.readback_checkpoint.writerGenerationId, manifest.writerGenerationId);
  assert.equal(completed.readback_checkpoint.destinationWorkbookId, manifest.destinationWorkbookId);
  assert.equal(completed.readback_checkpoint.targetContractFingerprint, manifest.targetContractFingerprint);
  assert.equal(completed.readback_checkpoint.structuralFingerprint, manifest.structuralFingerprint);
  assert.equal(completed.readback_checkpoint.runtimeRevision, manifest.runtimeRevision);
});

test("writer verification binding mismatch fails before checkpoint", async () => {
  let completed = false;
  let failure;
  const result = await processNextFutureMatchGoogleCompatibility({
    env: { VERCEL_ENV: "production" },
    dependencies: {
      resolveFutureMatchGoogleCompatibilityContext: resolveWriterContext,
      productionFutureGoogleWriterResources: writerResources,
      claimFutureMatchGoogleCompatibility: async () => ({ payload: { job } }),
      withProductionGoogleServiceAccountCredentials: async (_options, callback) => callback(),
      measure: async (_label, callback) => ({ result: await callback(), diagnostics: {} }),
      provisionFutureMatchGoogleCompatibility: async () => verifiedDelivery({
        destinationWorkbookId: "wrong-workbook",
      }),
      completeFutureMatchGoogleCompatibility: async () => { completed = true; },
      failFutureMatchGoogleCompatibility: async (input) => {
        failure = input;
        return { payload: { ok: true } };
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorStage, "google-writer");
  assert.equal(result.errorCode, "FUTURE_MATCH_GOOGLE_COMPATIBILITY_READBACK_MISMATCH");
  assert.equal(completed, false);
  assert.equal(failure.retryable, true);
});

test("lost-response retry is reported idempotently without another compatibility state", async () => {
  const result = await processNextFutureMatchGoogleCompatibility({
    env: { VERCEL_ENV: "production" },
    dependencies: {
      resolveFutureMatchGoogleCompatibilityContext: resolveWriterContext,
      productionFutureGoogleWriterResources: writerResources,
      claimFutureMatchGoogleCompatibility: async () => ({ payload: { job: { ...job, attempt: 2 } } }),
      withProductionGoogleServiceAccountCredentials: async (_options, callback) => callback(),
      measure: async (_label, callback) => ({ result: await callback(), diagnostics: {} }),
      provisionFutureMatchGoogleCompatibility: async () => verifiedDelivery({ idempotent: true }),
      completeFutureMatchGoogleCompatibility: async () => ({ payload: { ok: true, idempotent: true } }),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, true);
});

test("Google failure is retryable and never invokes a rollback/delete path", async () => {
  let failure;
  let completed = false;
  const result = await processNextFutureMatchGoogleCompatibility({
    env: { VERCEL_ENV: "production" },
    dependencies: {
      resolveFutureMatchGoogleCompatibilityContext: resolveWriterContext,
      productionFutureGoogleWriterResources: writerResources,
      claimFutureMatchGoogleCompatibility: async () => ({ payload: { job } }),
      withProductionGoogleServiceAccountCredentials: async (_options, callback) => callback(),
      measure: async (_label, callback) => callback(),
      provisionFutureMatchGoogleCompatibility: async () => {
        throw Object.assign(new Error("provider unavailable"), { code: "GOOGLE_SHEETS_HTTP_503" });
      },
      completeFutureMatchGoogleCompatibility: async () => { completed = true; },
      failFutureMatchGoogleCompatibility: async (input) => {
        failure = input;
        return { payload: { ok: true } };
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorStage, "google-writer");
  assert.equal(result.errorCode, "GOOGLE_SHEETS_HTTP_503");
  assert.equal(completed, false);
  assert.equal(failure.retryable, true);
  assert.equal(failure.safe_error_code, "GOOGLE_SHEETS_HTTP_503");
});

test("drain is bounded and stops only when the claim queue is empty", async () => {
  let claims = 0;
  const result = await drainFutureMatchGoogleCompatibility({
    maximum: 3,
    env: { VERCEL_ENV: "test" },
    dependencies: {
      resolveFutureMatchGoogleCompatibilityContext: resolveWriterContext,
      claimFutureMatchGoogleCompatibility: async () => {
        claims += 1;
        return claims === 1 ? { payload: { job } } : { payload: { job: null } };
      },
      measure: async (_label, callback) => ({ result: await callback(), diagnostics: {} }),
      provisionFutureMatchGoogleCompatibility: async () => verifiedDelivery(),
      completeFutureMatchGoogleCompatibility: async () => ({ payload: { ok: true } }),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.delivered, 1);
  assert.equal(claims, 2);
});

test("writer copies protected formulas and worker transport stays exact-scoped and private POST-only", async () => {
  const writer = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  const route = await readFile(new URL(
    "../app/api/cron/future-match-google-compatibility/route.js", import.meta.url,
  ), "utf8");
  const runtime = await readFile(new URL(
    "../lib/production-scoring-operations-server.js", import.meta.url,
  ), "utf8");
  const authority = await readFile(new URL(
    "../lib/scoring-authority-supabase.js", import.meta.url,
  ), "utf8");
  const futureServer = await readFile(new URL(
    "../lib/production-future-google-writer-server.js", import.meta.url,
  ), "utf8");
  assert.match(writer, /pasteType:\s*"PASTE_FORMULA"/);
  assert.match(writer, /target\.rawValues\?\.\["Match ID"\]/);
  assert.match(writer, /valueInputOption:\s*"RAW"/);
  assert.match(writer, /FUTURE_MATCH_RESULT_FIELDS/);
  assert.match(writer, /FUTURE_MATCH_ACCESS_SECRET_FIELDS/);
  assert.match(writer, /FUTURE_MATCH_GOOGLE_COMPATIBILITY_EXISTING_ROW_CONFLICT/);
  assert.match(route, /SCORING_GOOGLE_OUTBOX_WORKER_SECRET/);
  assert.match(route, /targetTournamentId/);
  assert.match(route, /FUTURE_MATCH_GOOGLE_COMPATIBILITY_TARGET_REQUIRED/);
  assert.match(route, /export async function GET\(\)[\s\S]*METHOD_NOT_ALLOWED/);
  assert.match(route, /VERCEL_ENV[\s\S]*production/);
  assert.doesNotMatch(route, /export async function (?:PUT|PATCH|DELETE)/);
  assert.match(runtime, /resolve_production_future_match_google_compatibility_v2:\s*"WORKERS"/);
  assert.match(futureServer, /"resolve_production_future_match_google_compatibility_v2"/);
  for (const rpc of ["claim", "complete", "fail"]) {
    assert.match(runtime, new RegExp(`${rpc}_production_future_match_google_compatibility_v2:\\s*"WORKERS"`));
    assert.match(futureServer, new RegExp(`${rpc}:\\s*"${rpc}_production_future_match_google_compatibility_v2"`));
  }
  assert.match(authority, /productionFutureGoogleWriterRpc\("claim"/);
  assert.match(authority, /productionFutureGoogleWriterRpc\("complete"/);
  assert.match(authority, /productionFutureGoogleWriterRpc\("fail"/);
  assert.match(authority, /resolveProductionFutureGoogleWriterContext/);
});
