import {
  ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
  ODDS_ENGINE_VERSION,
  ODDS_PHASES,
  ODDS_PUBLICATION_CONTRACT_VERSION,
  ODDS_SUPPORTED_ITERATION_COUNTS,
  createTournamentOddsCheckpoint,
  executeTournamentOddsChunk,
  finalizeTournamentOddsExecution,
  simulateTournamentOdds,
} from "./tournament-odds.js";
import { logicalOddsResult, loadSupabaseOddsInputs } from "./championship-odds-supabase.js";
import { canonicalJson, scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";

export const ODDS_CALCULATION_JOB_CONTRACT_VERSION = "championship-odds-calculation-job-v1";
export const ODDS_CALCULATION_CHUNK_ITERATIONS = 2_500;

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => JSON.parse(JSON.stringify(value));

function requiredHash(value, name) {
  const hash = clean(value).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw Object.assign(new Error(`${name} is unavailable.`), { code: "ODDS_CALCULATION_INPUT_INCOMPLETE" });
  return hash;
}

export function buildOddsCalculationInvocation({ inputs, phase, iterations, requestedBy = "Tournament Director", outputTimestamp = new Date().toISOString() } = {}) {
  if (!ODDS_PHASES.includes(clean(phase))) throw Object.assign(new Error("A supported Championship Odds phase is required."), { code: "INVALID_ODDS_MILESTONE" });
  const totalIterations = number(iterations);
  if (!ODDS_SUPPORTED_ITERATION_COUNTS.includes(totalIterations)) throw Object.assign(new Error("A supported Championship Odds iteration count is required."), { code: "INVALID_ODDS_ITERATION_COUNT" });
  const inputSnapshot = clone({ sheets: inputs?.sheets || {}, historical: inputs?.historical || {}, metadata: inputs?.metadata || {} });
  const tournamentId = clean(inputSnapshot.sheets?.tournaments?.[0]?.["Tournament ID"] || inputSnapshot.sheets?.tournaments?.[0]?.Year);
  if (!tournamentId) throw Object.assign(new Error("The Championship Odds tournament identity is unavailable."), { code: "ODDS_CALCULATION_INPUT_INCOMPLETE" });
  const settingsFingerprint = requiredHash(inputSnapshot.metadata?.settingsFingerprint, "Prediction Settings fingerprint");
  const inputFingerprint = scoringShadowPayloadHash(inputSnapshot);
  const checkpoint = createTournamentOddsCheckpoint({ ...inputSnapshot, phase, iterations: totalIterations });
  const invocation = {
    jobContractVersion: ODDS_CALCULATION_JOB_CONTRACT_VERSION,
    tournamentId,
    phase,
    iterations: totalIterations,
    inputFingerprint,
    settingsFingerprint,
    engineVersion: ODDS_ENGINE_VERSION,
    publicationContractVersion: ODDS_PUBLICATION_CONTRACT_VERSION,
    checkpointContractVersion: ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
    deterministicSeed: checkpoint.deterministicSeed,
  };
  const invocationFingerprint = scoringShadowPayloadHash(invocation);
  return {
    environment: "PREVIEW",
    job_id: invocationFingerprint,
    tournament_id: tournamentId,
    phase,
    total_iterations: totalIterations,
    engine_version: ODDS_ENGINE_VERSION,
    publication_contract_version: ODDS_PUBLICATION_CONTRACT_VERSION,
    checkpoint_contract_version: ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
    deterministic_seed: checkpoint.deterministicSeed,
    input_fingerprint: inputFingerprint,
    settings_fingerprint: settingsFingerprint,
    invocation_fingerprint: invocationFingerprint,
    source_revision: clone(inputSnapshot.metadata?.sourceRevision || {}),
    input_snapshot: inputSnapshot,
    checkpoint_payload: checkpoint,
    checkpoint_hash: scoringShadowPayloadHash(checkpoint),
    requested_by: clean(requestedBy) || "Tournament Director",
    output_timestamp: new Date(outputTimestamp).toISOString(),
  };
}

export const requestOddsCalculationJob = (input, options = {}) => scoringShadowRpc("request_preview_odds_calculation_job", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const claimOddsCalculationJob = (jobId, { workerId = "Championship Odds worker", ...options } = {}) => scoringShadowRpc("claim_preview_odds_calculation_job", { input: {
  environment: "PREVIEW", job_id: clean(jobId), worker_id: clean(workerId),
} }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const checkpointOddsCalculationJob = (input, options = {}) => scoringShadowRpc("checkpoint_preview_odds_calculation_job", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const completeOddsCalculationJob = (input, options = {}) => scoringShadowRpc("complete_preview_odds_calculation_job", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const failOddsCalculationJob = (input, options = {}) => scoringShadowRpc("fail_preview_odds_calculation_job", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const supersedeOddsCalculationJob = (jobId, options = {}) => scoringShadowRpc("supersede_preview_odds_calculation_job", { input: {
  environment: "PREVIEW", job_id: clean(jobId),
} }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const markOddsCalculationPublished = (jobId, publicationReference, options = {}) => scoringShadowRpc("mark_preview_odds_calculation_published", { input: {
  environment: "PREVIEW", job_id: clean(jobId), publication_reference: publicationReference || {},
} }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const readOddsCalculationJobs = (tournamentId, jobId = null, options = {}) => scoringShadowRpc("read_preview_odds_calculation_jobs", {
  target_tournament_id: clean(tournamentId), target_job_id: clean(jobId) || null,
}, { ...options, timeoutMs: options.timeoutMs || 15_000 });

export function publicOddsCalculationJob(job = {}) {
  const { input_snapshot: _inputSnapshot, checkpoint_payload: _checkpointPayload, result_payload: _resultPayload,
    claim_token: _claimToken, ...safe } = job;
  return {
    ...safe,
    progress: number(job.total_iterations) ? number(job.completed_iterations) / number(job.total_iterations) : 0,
    result: job.status === "SUCCEEDED" ? job.result_payload || null : null,
  };
}

function processMemoryMetrics({ startedAt, cpuBefore, base = {}, prior = {}, checkpoint, chunkStartedAt }) {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage(cpuBefore);
  return {
    totalWorkerMs: number(base.totalWorkerMs) + (performance.now() - startedAt),
    lastChunkMs: performance.now() - chunkStartedAt,
    cpuMs: number(base.cpuMs) + (cpu.user + cpu.system) / 1_000,
    peakRssBytes: Math.max(number(prior.peakRssBytes), memory.rss),
    peakHeapUsedBytes: Math.max(number(prior.peakHeapUsedBytes), memory.heapUsed),
    completedIterations: number(checkpoint.completedIterations),
  };
}

export async function processOddsCalculationJob(jobId, {
  workerId = `Championship Odds worker ${process.pid}`,
  chunkIterations = ODDS_CALCULATION_CHUNK_ITERATIONS,
  failureAt = "",
  dependencies = {},
} = {}) {
  const claimJob = dependencies.claimJob || claimOddsCalculationJob;
  const writeCheckpoint = dependencies.writeCheckpoint || checkpointOddsCalculationJob;
  const completeJob = dependencies.completeJob || completeOddsCalculationJob;
  const failJob = dependencies.failJob || failOddsCalculationJob;
  const claim = await claimJob(jobId, { workerId });
  if (!claim.payload?.ok) throw Object.assign(new Error("Championship Odds calculation could not be claimed."), { code: claim.payload?.code || "ODDS_CALCULATION_CLAIM_FAILED" });
  if (!claim.payload.deliver) return { processed: false, completed: claim.payload.completed === true, inProgress: claim.payload.in_progress === true, job: claim.payload.job || null };
  const job = claim.payload.job;
  const claimToken = clean(job.claim_token);
  let checkpoint = clone(job.checkpoint_payload);
  let metrics = clone(job.resource_metrics || {});
  const baseMetrics = clone(metrics);
  const workerStartedAt = performance.now();
  const cpuBefore = process.cpuUsage();
  let injectedMidFailure = false;
  try {
    if (failureAt === "BEFORE_FIRST_CHUNK") throw Object.assign(new Error("Injected failure before the first chunk."), { code: "ODDS_REHEARSAL_BEFORE_FIRST_CHUNK" });
    while (number(checkpoint.completedIterations) < number(job.total_iterations)) {
      const chunkStartedAt = performance.now();
      checkpoint = executeTournamentOddsChunk({
        ...job.input_snapshot,
        phase: job.phase,
        iterations: number(job.total_iterations),
        checkpoint,
        chunkIterations,
      });
      metrics = processMemoryMetrics({ startedAt: workerStartedAt, cpuBefore, base: baseMetrics, prior: metrics, checkpoint, chunkStartedAt });
      const stored = await writeCheckpoint({
        environment: "PREVIEW",
        job_id: job.job_id,
        claim_token: claimToken,
        completed_iterations: checkpoint.completedIterations,
        checkpoint_payload: checkpoint,
        checkpoint_hash: scoringShadowPayloadHash(checkpoint),
        resource_metrics: metrics,
      });
      if (!stored.payload?.ok) throw Object.assign(new Error("Championship Odds checkpoint could not be stored."), { code: stored.payload?.code || "ODDS_CALCULATION_CHECKPOINT_FAILED" });
      if (failureAt === "AFTER_CHECKPOINT") throw Object.assign(new Error("Injected failure after a durable checkpoint."), { code: "ODDS_REHEARSAL_AFTER_CHECKPOINT" });
      if (failureAt === "MID_CALCULATION" && !injectedMidFailure && checkpoint.completedIterations >= job.total_iterations / 2) {
        injectedMidFailure = true;
        throw Object.assign(new Error("Injected failure during calculation."), { code: "ODDS_REHEARSAL_MID_CALCULATION" });
      }
    }
    if (failureAt === "AFTER_FINAL_CHECKPOINT") throw Object.assign(new Error("Injected failure after the final checkpoint."), { code: "ODDS_REHEARSAL_AFTER_FINAL_CHECKPOINT" });
    const result = finalizeTournamentOddsExecution({
      ...job.input_snapshot,
      phase: job.phase,
      iterations: number(job.total_iterations),
      checkpoint,
      publishedAt: job.output_timestamp,
    });
    const resultFingerprint = scoringShadowPayloadHash(logicalOddsResult(result));
    const serialized = JSON.stringify(result);
    const completed = await completeJob({
      environment: "PREVIEW",
      job_id: job.job_id,
      claim_token: claimToken,
      result_payload: result,
      result_fingerprint: resultFingerprint,
      output_payload_bytes: Buffer.byteLength(serialized),
      resource_metrics: metrics,
    });
    if (!completed.payload?.ok) throw Object.assign(new Error("Championship Odds calculation result could not be committed."), { code: completed.payload?.code || "ODDS_CALCULATION_RESULT_COMMIT_FAILED" });
    if (failureAt === "AFTER_RESULT_COMMIT") throw Object.assign(new Error("Injected interruption after result commit."), { code: "ODDS_REHEARSAL_AFTER_RESULT_COMMIT", resultCommitted: true });
    return { processed: true, completed: true, jobId: job.job_id, result, resultFingerprint, metrics,
      checkpoints: number(completed.payload.checkpoint_count), attempts: number(completed.payload.attempt_count), duplicate: completed.payload.duplicate === true };
  } catch (error) {
    const failed = await failJob({
      environment: "PREVIEW",
      job_id: job.job_id,
      claim_token: claimToken,
      retryable: error?.retryable !== false,
      error_code: clean(error?.code || "ODDS_CALCULATION_FAILED"),
      error_safe: "Championship calculation stopped safely and can resume from its last verified checkpoint.",
    }).catch(() => null);
    error.jobFailure = failed?.payload || null;
    throw error;
  }
}

export async function requestCanonicalOddsCalculation({ tournamentId, phase, iterations, requestedBy, outputTimestamp, dependencies = {} } = {}) {
  const loadInputs = dependencies.loadInputs || loadSupabaseOddsInputs;
  const requestJob = dependencies.requestJob || requestOddsCalculationJob;
  const inputStartedAt = performance.now();
  const inputs = await loadInputs(tournamentId);
  const inputPreparationMs = performance.now() - inputStartedAt;
  const transformationStartedAt = performance.now();
  const invocation = buildOddsCalculationInvocation({ inputs, phase, iterations, requestedBy, outputTimestamp });
  invocation.resource_metrics = {
    inputPreparationMs,
    supabaseQueryMs: number(inputs.diagnostics?.queryMs),
    supabaseServiceMs: number(inputs.diagnostics?.serviceMs),
    transformationMs: performance.now() - transformationStartedAt,
    inputSnapshotBytes: Buffer.byteLength(JSON.stringify(invocation.input_snapshot)),
  };
  const requested = await requestJob(invocation);
  if (!requested.payload?.ok) throw Object.assign(new Error("Championship Odds calculation could not be requested."), { code: requested.payload?.code || "ODDS_CALCULATION_REQUEST_FAILED" });
  return { invocation, requested: requested.payload, inputs };
}

export async function readPublishableOddsCalculation({ tournamentId, jobId, dependencies = {} } = {}) {
  const readJobs = dependencies.readJobs || readOddsCalculationJobs;
  const loadInputs = dependencies.loadInputs || loadSupabaseOddsInputs;
  const supersedeJob = dependencies.supersedeJob || supersedeOddsCalculationJob;
  const stored = await readJobs(tournamentId, jobId);
  if (!stored.payload?.ok) throw Object.assign(new Error("Championship Odds calculation state is unavailable."), { code: stored.payload?.code || "ODDS_CALCULATION_STATE_UNAVAILABLE" });
  const job = stored.payload.jobs?.[0];
  if (!job || clean(job.job_id) !== clean(jobId)) throw Object.assign(new Error("Championship Odds calculation was not found."), { code: "ODDS_CALCULATION_JOB_NOT_FOUND" });
  if (job.status !== "SUCCEEDED" || !job.result_payload) throw Object.assign(new Error("Championship Odds calculation is not complete."), { code: "ODDS_CALCULATION_NOT_READY" });
  const currentInputs = await loadInputs(tournamentId);
  const current = buildOddsCalculationInvocation({ inputs: currentInputs, phase: job.phase, iterations: job.total_iterations, requestedBy: job.requested_by, outputTimestamp: job.output_timestamp });
  if (current.input_fingerprint !== job.input_fingerprint || current.settings_fingerprint !== job.settings_fingerprint ||
      current.engine_version !== job.engine_version || current.publication_contract_version !== job.publication_contract_version) {
    await supersedeJob(jobId).catch(() => null);
    throw Object.assign(new Error("Canonical Championship Odds inputs advanced after this result was calculated."), { code: "ODDS_CALCULATION_STALE" });
  }
  const logicalFingerprint = scoringShadowPayloadHash(logicalOddsResult(job.result_payload));
  if (logicalFingerprint !== job.result_fingerprint) throw Object.assign(new Error("Stored Championship Odds result verification failed."), { code: "ODDS_CALCULATION_RESULT_INVALID" });
  return { job, snapshot: { ...clone(job.result_payload), publishedAt: new Date().toISOString() }, currentInputs };
}

export async function certifyOddsCalculationReference({ tournamentId, jobId, dependencies = {} } = {}) {
  const readJobs = dependencies.readJobs || readOddsCalculationJobs;
  const stored = await readJobs(tournamentId, jobId);
  if (!stored.payload?.ok) throw Object.assign(new Error("Championship Odds calculation state is unavailable."), { code: stored.payload?.code || "ODDS_CALCULATION_STATE_UNAVAILABLE" });
  const job = stored.payload.jobs?.[0];
  if (!job || clean(job.job_id) !== clean(jobId)) throw Object.assign(new Error("Championship Odds calculation was not found."), { code: "ODDS_CALCULATION_JOB_NOT_FOUND" });
  if (job.status !== "SUCCEEDED" || !job.input_snapshot || !job.result_payload) {
    throw Object.assign(new Error("Championship Odds calculation is not complete."), { code: "ODDS_CALCULATION_NOT_READY" });
  }
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const startedAt = performance.now();
  const reference = simulateTournamentOdds({
    ...job.input_snapshot,
    phase: job.phase,
    iterations: number(job.total_iterations),
    publishedAt: job.output_timestamp,
  });
  const durationMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  const referenceLogical = logicalOddsResult(reference);
  const resilientLogical = logicalOddsResult(job.result_payload);
  const referenceFingerprint = scoringShadowPayloadHash(referenceLogical);
  const resilientFingerprint = scoringShadowPayloadHash(resilientLogical);
  return {
    ok: referenceFingerprint === resilientFingerprint && canonicalJson(referenceLogical) === canonicalJson(resilientLogical),
    jobId: job.job_id,
    iterations: number(job.total_iterations),
    referenceFingerprint,
    resilientFingerprint,
    exactEquality: canonicalJson(referenceLogical) === canonicalJson(resilientLogical),
    storedFingerprintValid: resilientFingerprint === clean(job.result_fingerprint),
    referenceMetrics: {
      durationMs,
      cpuMs: (cpu.user + cpu.system) / 1_000,
      rssBeforeBytes: memoryBefore.rss,
      rssAfterBytes: memoryAfter.rss,
      heapBeforeBytes: memoryBefore.heapUsed,
      heapAfterBytes: memoryAfter.heapUsed,
    },
  };
}
