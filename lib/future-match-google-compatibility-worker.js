import { randomUUID } from "node:crypto";

import {
  futureMatchGoogleCompatibilityManifestFingerprint,
  futureMatchGoogleCompatibilityProjection,
  provisionFutureMatchGoogleCompatibility,
  withWorkbookWriteDiagnostics,
} from "./google-sheets-write.js";
import {
  claimFutureMatchGoogleCompatibility,
  completeFutureMatchGoogleCompatibility,
  failFutureMatchGoogleCompatibility,
  resolveFutureMatchGoogleCompatibilityContext,
} from "./scoring-authority-supabase.js";
import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const WORKER_CONTRACT = "production-future-google-match-provisioning-v2";

async function withFutureMatchCompatibilityCredential(
  env,
  dependencies,
  writerContext,
  callback,
) {
  if (clean(env?.VERCEL_ENV).toLowerCase() !== "production") return callback();
  const scope = dependencies.withProductionGoogleServiceAccountCredentials ||
    (await import("./production-google-service-account-server.js")).withProductionGoogleServiceAccountCredentials;
  const resources = dependencies.productionFutureGoogleWriterResources ||
    (await import("./production-future-google-writer-server.js"))
      .productionFutureGoogleWriterResources;
  return scope({
    env,
    operation: "FUTURE_MATCH_GOOGLE_COMPATIBILITY",
    resources: resources(writerContext),
  }, callback);
}

function claimedManifest(job = {}, supplied = null) {
  if (supplied && typeof supplied === "object") return supplied;
  for (const value of [
    job.provisioning_manifest,
    job.provisioningManifest,
    job.compatibility_manifest,
    job.compatibilityManifest,
    job.manifest,
    job.payload,
  ]) {
    if (value && typeof value === "object") return value;
  }
  return null;
}

export function futureMatchGoogleCompatibilityJobInput(job = {}, manifest = null, {
  expectedTournamentId = "",
  writerContext = null,
} = {}) {
  const jobId = clean(job.job_id || job.jobId || job.id);
  const claimToken = clean(job.claim_token || job.claimToken);
  const tournamentId = clean(job.tournament_id || job.tournamentId);
  const matchId = clean(job.match_id || job.matchId);
  const sourceWorkbookId = clean(job.source_workbook_id || job.sourceWorkbookId);
  const writerGenerationId = clean(job.writer_generation_id || job.writerGenerationId).toLowerCase();
  const destinationWorkbookId = clean(job.destination_workbook_id || job.destinationWorkbookId);
  const targetContractFingerprint = clean(
    job.target_contract_fingerprint || job.targetContractFingerprint,
  ).toLowerCase();
  const structuralFingerprint = clean(
    job.structural_fingerprint || job.structuralFingerprint,
  ).toLowerCase();
  const runtimeRevision = number(job.runtime_revision || job.runtimeRevision);
  const source = claimedManifest(job, manifest);
  if (!jobId || !claimToken || !/^\d{4}$/.test(tournamentId) ||
      tournamentId === PRODUCTION_TOURNAMENT_ID || !matchId || !source ||
      sourceWorkbookId !== destinationWorkbookId ||
      (clean(expectedTournamentId) && tournamentId !== clean(expectedTournamentId)) ||
      clean(source.contractVersion || source.contract_version) !== WORKER_CONTRACT ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(writerGenerationId) ||
      !/^[0-9a-f]{64}$/.test(targetContractFingerprint) ||
      !/^[0-9a-f]{64}$/.test(structuralFingerprint) || runtimeRevision < 1 ||
      (writerContext && (
        tournamentId !== clean(writerContext.targetTournamentId) ||
        writerGenerationId !== clean(writerContext.writerGenerationId) ||
        destinationWorkbookId !== clean(writerContext.destinationWorkbookId) ||
        targetContractFingerprint !== clean(writerContext.targetContractFingerprint)
      ))) {
    throw Object.assign(new Error("The claimed future match compatibility job is incomplete."), {
      code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_CLAIM_INVALID",
    });
  }
  const projection = futureMatchGoogleCompatibilityProjection(source);
  if (projection.tournamentId !== tournamentId || projection.matchId !== matchId ||
      projection.writerGenerationId !== writerGenerationId ||
      projection.destinationWorkbookId !== destinationWorkbookId ||
      projection.targetContractFingerprint !== targetContractFingerprint ||
      projection.structuralFingerprint !== structuralFingerprint ||
      projection.runtimeRevision !== runtimeRevision) {
    throw Object.assign(new Error("The claimed future match compatibility manifest does not match its job scope."), {
      code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_SCOPE_MISMATCH",
    });
  }
  const expectedManifestFingerprint = clean(
    job.expected_manifest_fingerprint || job.expectedManifestFingerprint ||
    job.manifest_fingerprint || job.manifestFingerprint ||
    job.provisioning_manifest_fingerprint || job.provisioningManifestFingerprint,
  );
  if (!/^[0-9a-f]{64}$/.test(expectedManifestFingerprint)) {
    throw Object.assign(new Error("The claimed future match compatibility manifest fingerprint is invalid."), {
      code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_CLAIM_INVALID",
    });
  }
  const computedManifestFingerprint = futureMatchGoogleCompatibilityManifestFingerprint(source);
  if (expectedManifestFingerprint !== computedManifestFingerprint) {
    throw Object.assign(new Error("The claimed future match compatibility manifest fingerprint does not match its payload."), {
      code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_MANIFEST_FINGERPRINT_MISMATCH",
    });
  }
  return {
    jobId,
    claimToken,
    tournamentId,
    matchId,
    attempts: number(job.attempt ?? job.attempts),
    expectedManifestFingerprint,
    sourceWorkbookId,
    writerGenerationId,
    destinationWorkbookId,
    targetContractFingerprint,
    structuralFingerprint,
    runtimeRevision,
    manifest: source,
    projection,
  };
}

export function futureMatchGoogleCompatibilityFailureCode(error) {
  const explicit = clean(error?.code || error?.status);
  if (explicit && explicit !== "Error") return explicit.slice(0, 120);
  const message = clean(error?.message);
  const httpStatus = message.match(/Google Sheets request failed \((\d{3})\)/i)?.[1];
  if (httpStatus) return `GOOGLE_SHEETS_HTTP_${httpStatus}`;
  if (/credential/i.test(message)) return "FUTURE_MATCH_GOOGLE_CREDENTIAL_UNAVAILABLE";
  if (/readback/i.test(message)) return "FUTURE_MATCH_GOOGLE_COMPATIBILITY_READBACK_MISMATCH";
  return "FUTURE_MATCH_GOOGLE_COMPATIBILITY_DELIVERY_FAILED";
}

export async function processNextFutureMatchGoogleCompatibility({
  targetTournamentId = "",
  workerId = `future-match-google:${randomUUID()}`,
  actor = "Supabase future match compatibility",
  env = process.env,
  dependencies = {},
} = {}) {
  const writerContext = await (
    dependencies.resolveFutureMatchGoogleCompatibilityContext ||
    resolveFutureMatchGoogleCompatibilityContext
  )(targetTournamentId, { env });
  const claim = await (dependencies.claimFutureMatchGoogleCompatibility || claimFutureMatchGoogleCompatibility)(
    workerId,
    { leaseSeconds: 90, targetTournamentId, writerContext, env },
  );
  const job = claim.payload?.job;
  if (!job) return { ok: true, empty: true };
  let input;
  try {
    input = futureMatchGoogleCompatibilityJobInput(job, claim.payload?.manifest, {
      expectedTournamentId: targetTournamentId,
      writerContext,
    });
  } catch (error) {
    await (dependencies.failFutureMatchGoogleCompatibility || failFutureMatchGoogleCompatibility)({
      job_id: clean(job.job_id || job.jobId || job.id),
      claim_token: clean(job.claim_token || job.claimToken),
      target_tournament_id: clean(job.tournament_id || job.tournamentId),
      safe_error_code: futureMatchGoogleCompatibilityFailureCode(error),
      retryable: false,
    }, { env, writerContext }).catch(() => {});
    return {
      ok: false,
      empty: false,
      jobId: clean(job.job_id || job.jobId || job.id),
      errorCode: futureMatchGoogleCompatibilityFailureCode(error),
      errorStage: "claim-validation",
    };
  }
  const startedAt = Date.now();
  let stage = "google-writer";
  try {
    const measure = dependencies.measure || withWorkbookWriteDiagnostics;
    const measured = await withFutureMatchCompatibilityCredential(
      env,
      dependencies,
      writerContext,
      () =>
      measure("future-match-google-compatibility", async () => {
        stage = "google-writer";
        const provision = dependencies.provisionFutureMatchGoogleCompatibility ||
          provisionFutureMatchGoogleCompatibility;
        return provision(input.manifest, { actor });
      }),
    );
    const verification = measured.result;
    if (!verification?.pass || verification.matchId !== input.matchId ||
        verification.tournamentId !== input.tournamentId ||
        verification.manifestFingerprint !== input.projection.manifestFingerprint ||
        clean(verification.writerGenerationId).toLowerCase() !== input.writerGenerationId ||
        clean(verification.destinationWorkbookId) !== input.destinationWorkbookId ||
        clean(verification.targetContractFingerprint).toLowerCase() !==
          input.targetContractFingerprint ||
        clean(verification.structuralFingerprint).toLowerCase() !==
          input.structuralFingerprint ||
        number(verification.runtimeRevision) !== input.runtimeRevision ||
        !/^[0-9a-f]{64}$/.test(clean(verification.googleReadbackFingerprint))) {
      throw Object.assign(new Error("Future match Google compatibility fresh readback did not verify."), {
        code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_READBACK_MISMATCH",
      });
    }
    stage = "checkpoint";
    const completion = await (dependencies.completeFutureMatchGoogleCompatibility || completeFutureMatchGoogleCompatibility)({
      job_id: input.jobId,
      claim_token: input.claimToken,
      target_tournament_id: input.tournamentId,
      expected_manifest_fingerprint: input.expectedManifestFingerprint,
      expected_structural_fingerprint: input.structuralFingerprint,
      readback_fingerprint: verification.googleReadbackFingerprint,
      readback_checkpoint: {
        liveMatchVerified: true,
        archiveMatchVerified: true,
        matchId: input.matchId,
        writerContractVersion: verification.contractVersion,
        writerGenerationId: input.writerGenerationId,
        destinationWorkbookId: input.destinationWorkbookId,
        targetContractFingerprint: input.targetContractFingerprint,
        structuralFingerprint: input.structuralFingerprint,
        runtimeRevision: input.runtimeRevision,
        projectionFingerprint: input.projection.manifestFingerprint,
        liveMatchesRowNumber: verification.liveMatches?.rowNumber || null,
        matchesRowNumber: verification.matches?.rowNumber || null,
      },
    }, { env, writerContext });
    if (!completion.payload?.ok) throw Object.assign(
      new Error(`Future match compatibility checkpoint failed: ${completion.payload?.code || "unknown"}.`),
      { code: completion.payload?.code || "FUTURE_MATCH_GOOGLE_COMPATIBILITY_CHECKPOINT_FAILED" },
    );
    return {
      ok: true,
      empty: false,
      jobId: input.jobId,
      tournamentId: input.tournamentId,
      matchId: input.matchId,
      attempts: input.attempts,
      idempotent: Boolean(verification.idempotent || completion.payload?.idempotent),
      durationMs: Date.now() - startedAt,
      googleDiagnostics: measured.diagnostics || {},
      checkpoint: completion.payload.checkpoint || completion.payload.job || null,
    };
  } catch (error) {
    const errorCode = futureMatchGoogleCompatibilityFailureCode(error);
    await (dependencies.failFutureMatchGoogleCompatibility || failFutureMatchGoogleCompatibility)({
      job_id: input.jobId,
      claim_token: input.claimToken,
      target_tournament_id: input.tournamentId,
      safe_error_code: errorCode,
      retryable: input.attempts < 10,
    }, { env, writerContext }).catch(() => {});
    return {
      ok: false,
      empty: false,
      jobId: input.jobId,
      tournamentId: input.tournamentId,
      matchId: input.matchId,
      attempts: input.attempts,
      durationMs: Date.now() - startedAt,
      errorCode,
      errorStage: stage,
    };
  }
}

export async function drainFutureMatchGoogleCompatibility({ maximum = 10, stopOnFailure = false, ...options } = {}) {
  const startedAt = Date.now();
  const deliveries = [];
  for (let index = 0; index < Math.max(1, Math.min(number(maximum, 10), 50)); index += 1) {
    const delivery = await processNextFutureMatchGoogleCompatibility(options);
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
