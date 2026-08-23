import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ODDS_CALCULATION_CHUNK_ITERATIONS,
  ODDS_CALCULATION_JOB_CONTRACT_VERSION,
  buildOddsCalculationInvocation,
  certifyOddsCalculationReference,
  processOddsCalculationJob,
  readPublishableOddsCalculation,
} from "../lib/championship-odds-resilience.js";
import { logicalOddsResult } from "../lib/championship-odds-supabase.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";
import {
  ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
  ODDS_ENGINE_VERSION,
  ODDS_PUBLICATION_CONTRACT_VERSION,
  ODDS_SUPPORTED_ITERATION_COUNTS,
  createTournamentOddsCheckpoint,
  executeTournamentOddsChunk,
  finalizeTournamentOddsExecution,
  simulateTournamentOdds,
} from "../lib/tournament-odds.js";
import {
  championshipOddsResilienceFixture,
  RESILIENCE_PHASE,
  RESILIENCE_PUBLISHED_AT,
  RESILIENCE_REFERENCE_FINGERPRINTS,
} from "./fixtures/championship-odds-resilience.mjs";

const settingsFingerprint = "1".repeat(64);

function canonicalInputs() {
  return {
    ...championshipOddsResilienceFixture(),
    metadata: {
      settingsFingerprint,
      sourceRevision: { matches: [{ matchId: "R1-1", revision: 7 }], settingsRevision: 2 },
      sourceFingerprint: "2".repeat(64),
      pairingFingerprint: "3".repeat(64),
      configurationRevision: 2,
    },
  };
}

function fakeJob({ totalIterations = 240 } = {}) {
  const inputs = canonicalInputs();
  const checkpoint = createTournamentOddsCheckpoint({ ...inputs, phase: RESILIENCE_PHASE, iterations: totalIterations });
  return {
    job_id: "a".repeat(64), tournament_id: "2026", phase: RESILIENCE_PHASE,
    total_iterations: totalIterations, completed_iterations: 0, status: "PENDING", attempt_count: 0,
    checkpoint_count: 0, checkpoint_payload: checkpoint, checkpoint_hash: scoringShadowPayloadHash(checkpoint),
    checkpoint_contract_version: ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
    input_snapshot: JSON.parse(JSON.stringify(inputs)), resource_metrics: {}, output_timestamp: RESILIENCE_PUBLISHED_AT,
  };
}

function inMemoryJobDependencies(initialJob) {
  const state = { job: JSON.parse(JSON.stringify(initialJob)), checkpoints: [], failures: 0, completions: 0 };
  return {
    state,
    dependencies: {
      claimJob: async () => {
        if (state.job.status === "SUCCEEDED") return { payload: { ok: true, deliver: false, completed: true, job: state.job } };
        if (["FAILED", "SUPERSEDED"].includes(state.job.status)) return { payload: { ok: false, code: `ODDS_CALCULATION_JOB_${state.job.status}` } };
        state.job.status = "RUNNING"; state.job.attempt_count += 1; state.job.claim_token = `00000000-0000-4000-8000-${String(state.job.attempt_count).padStart(12, "0")}`;
        return { payload: { ok: true, deliver: true, job: JSON.parse(JSON.stringify(state.job)) } };
      },
      writeCheckpoint: async (input) => {
        assert.equal(input.claim_token, state.job.claim_token);
        state.job.completed_iterations = input.completed_iterations;
        state.job.checkpoint_payload = JSON.parse(JSON.stringify(input.checkpoint_payload));
        state.job.checkpoint_hash = input.checkpoint_hash;
        state.job.checkpoint_count += 1;
        state.job.resource_metrics = input.resource_metrics;
        state.checkpoints.push({ completedIterations: input.completed_iterations, hash: input.checkpoint_hash });
        return { payload: { ok: true, checkpoint_count: state.job.checkpoint_count } };
      },
      completeJob: async (input) => {
        if (state.job.status === "SUCCEEDED") return { payload: { ok: true, duplicate: true, checkpoint_count: state.job.checkpoint_count, attempt_count: state.job.attempt_count } };
        state.completions += 1; state.job.status = "SUCCEEDED"; state.job.result_payload = input.result_payload;
        state.job.result_fingerprint = input.result_fingerprint; state.job.claim_token = null;
        return { payload: { ok: true, duplicate: false, checkpoint_count: state.job.checkpoint_count, attempt_count: state.job.attempt_count } };
      },
      failJob: async () => {
        state.failures += 1;
        if (state.job.status !== "SUCCEEDED") { state.job.status = "RETRYABLE"; state.job.claim_token = null; return { payload: { ok: true, marked: true, retryable: true } }; }
        return { payload: { ok: true, marked: false, stale_claim: true } };
      },
    },
  };
}

test("resumable chunks preserve the exact sequential random stream and complete raw result", () => {
  const fixture = championshipOddsResilienceFixture();
  const input = { ...fixture, phase: RESILIENCE_PHASE, iterations: 600 };
  const reference = simulateTournamentOdds({ ...input, publishedAt: RESILIENCE_PUBLISHED_AT });
  let checkpoint = createTournamentOddsCheckpoint(input);
  for (const chunk of [17, 83, 211, 29, 260]) {
    checkpoint = JSON.parse(JSON.stringify(executeTournamentOddsChunk({ ...input, checkpoint, chunkIterations: chunk })));
  }
  const resilient = finalizeTournamentOddsExecution({ ...input, checkpoint, publishedAt: RESILIENCE_PUBLISHED_AT });
  assert.deepEqual(resilient, reference);
  assert.equal(checkpoint.completedIterations, 600);
  assert.equal(checkpoint.checkpointContractVersion, ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION);
});

test("the refactored synchronous path retains the frozen 10k pre-change fingerprint", () => {
  const result = simulateTournamentOdds({ ...championshipOddsResilienceFixture(), phase: RESILIENCE_PHASE,
    iterations: 10_000, publishedAt: RESILIENCE_PUBLISHED_AT });
  assert.equal(scoringShadowPayloadHash(logicalOddsResult(result)), RESILIENCE_REFERENCE_FINGERPRINTS[10_000]);
});

test("all four supported counts receive deterministic distinct job identities without changing the engine contract", () => {
  const inputs = canonicalInputs();
  const jobs = ODDS_SUPPORTED_ITERATION_COUNTS.map((iterations) => buildOddsCalculationInvocation({
    inputs, phase: RESILIENCE_PHASE, iterations, requestedBy: "DIRECTOR", outputTimestamp: RESILIENCE_PUBLISHED_AT,
  }));
  assert.deepEqual(ODDS_SUPPORTED_ITERATION_COUNTS, [10_000, 25_000, 50_000, 100_000]);
  assert.equal(new Set(jobs.map((job) => job.job_id)).size, 4);
  for (const job of jobs) {
    assert.equal(job.job_id, job.invocation_fingerprint);
    assert.equal(job.engine_version, ODDS_ENGINE_VERSION);
    assert.equal(job.publication_contract_version, ODDS_PUBLICATION_CONTRACT_VERSION);
    assert.equal(job.checkpoint_contract_version, ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION);
    assert.equal(job.input_snapshot.metadata.settingsFingerprint, settingsFingerprint);
  }
  assert.equal(ODDS_CALCULATION_JOB_CONTRACT_VERSION, "championship-odds-calculation-job-v1");
  assert.equal(ODDS_CALCULATION_CHUNK_ITERATIONS, 2_500);
});

test("job inputs are frozen and later caller mutation cannot change the invocation", () => {
  const inputs = canonicalInputs();
  const job = buildOddsCalculationInvocation({ inputs, phase: RESILIENCE_PHASE, iterations: 10_000, outputTimestamp: RESILIENCE_PUBLISHED_AT });
  inputs.sheets.matches[0]["Team 1 Points"] = 99;
  inputs.metadata.sourceRevision.matches[0].revision = 99;
  assert.notEqual(job.input_snapshot.sheets.matches[0]["Team 1 Points"], 99);
  assert.equal(job.input_snapshot.metadata.sourceRevision.matches[0].revision, 7);
  assert.equal(job.input_fingerprint, scoringShadowPayloadHash(job.input_snapshot));
});

test("a failed worker resumes from its persisted PRNG checkpoint and produces the exact reference", async () => {
  const memory = inMemoryJobDependencies(fakeJob({ totalIterations: 240 }));
  await assert.rejects(() => processOddsCalculationJob(memory.state.job.job_id, {
    chunkIterations: 60, failureAt: "MID_CALCULATION", dependencies: memory.dependencies,
  }), /Injected failure during calculation/);
  const retainedProgress = memory.state.job.completed_iterations;
  assert.equal(memory.state.job.status, "RETRYABLE");
  assert.ok(retainedProgress >= 120);
  const completed = await processOddsCalculationJob(memory.state.job.job_id, { chunkIterations: 60, dependencies: memory.dependencies });
  const reference = simulateTournamentOdds({ ...canonicalInputs(), phase: RESILIENCE_PHASE, iterations: 240, publishedAt: RESILIENCE_PUBLISHED_AT });
  assert.deepEqual(completed.result, reference);
  assert.equal(memory.state.job.result_fingerprint, scoringShadowPayloadHash(logicalOddsResult(reference)));
  assert.equal(memory.state.failures, 1);
  assert.equal(memory.state.completions, 1);
  assert.equal(memory.state.job.attempt_count, 2);
  assert.ok(memory.state.checkpoints.some((entry) => entry.completedIterations === retainedProgress));
});

test("an interruption after result commit remains idempotently succeeded", async () => {
  const memory = inMemoryJobDependencies(fakeJob({ totalIterations: 120 }));
  await assert.rejects(() => processOddsCalculationJob(memory.state.job.job_id, {
    chunkIterations: 60, failureAt: "AFTER_RESULT_COMMIT", dependencies: memory.dependencies,
  }), /Injected interruption after result commit/);
  assert.equal(memory.state.job.status, "SUCCEEDED");
  assert.equal(memory.state.completions, 1);
  const replay = await processOddsCalculationJob(memory.state.job.job_id, { chunkIterations: 60, dependencies: memory.dependencies });
  assert.equal(replay.processed, false);
  assert.equal(replay.completed, true);
  assert.equal(memory.state.completions, 1);
});

for (const boundary of ["BEFORE_FIRST_CHUNK", "AFTER_CHECKPOINT", "AFTER_FINAL_CHECKPOINT"]) {
  test(`a ${boundary.toLowerCase()} interruption resumes to the exact result`, async () => {
    const memory = inMemoryJobDependencies(fakeJob({ totalIterations: 120 }));
    await assert.rejects(() => processOddsCalculationJob(memory.state.job.job_id, {
      chunkIterations: boundary === "AFTER_FINAL_CHECKPOINT" ? 120 : 60,
      failureAt: boundary,
      dependencies: memory.dependencies,
    }), /Injected failure/);
    assert.equal(memory.state.job.status, "RETRYABLE");
    const completed = await processOddsCalculationJob(memory.state.job.job_id, { chunkIterations: 60, dependencies: memory.dependencies });
    const reference = simulateTournamentOdds({ ...canonicalInputs(), phase: RESILIENCE_PHASE, iterations: 120, publishedAt: RESILIENCE_PUBLISHED_AT });
    assert.deepEqual(completed.result, reference);
    assert.equal(memory.state.job.result_fingerprint, scoringShadowPayloadHash(logicalOddsResult(reference)));
  });
}

test("a completed result is superseded rather than published when canonical input advances", async () => {
  const oldInputs = canonicalInputs();
  const invocation = buildOddsCalculationInvocation({ inputs: oldInputs, phase: RESILIENCE_PHASE, iterations: 10_000, outputTimestamp: RESILIENCE_PUBLISHED_AT });
  const job = { ...invocation, status: "SUCCEEDED", result_payload: { deterministic: true },
    result_fingerprint: scoringShadowPayloadHash({ deterministic: true }) };
  const currentInputs = canonicalInputs();
  currentInputs.sheets.matches[0]["Team 1 Points"] = 2.5;
  let superseded = false;
  await assert.rejects(() => readPublishableOddsCalculation({ tournamentId: "2026", jobId: job.job_id, dependencies: {
    readJobs: async () => ({ payload: { ok: true, jobs: [job] } }),
    loadInputs: async () => currentInputs,
    supersedeJob: async () => { superseded = true; return { payload: { ok: true } }; },
  } }), (error) => error.code === "ODDS_CALCULATION_STALE");
  assert.equal(superseded, true);
});

test("protected reference certification compares the complete stored result without publishing", async () => {
  const inputs = canonicalInputs();
  const result = simulateTournamentOdds({ ...inputs, phase: RESILIENCE_PHASE, iterations: 120, publishedAt: RESILIENCE_PUBLISHED_AT });
  const job = {
    job_id: "b".repeat(64), tournament_id: "2026", phase: RESILIENCE_PHASE, total_iterations: 120,
    status: "SUCCEEDED", input_snapshot: inputs, result_payload: result, output_timestamp: RESILIENCE_PUBLISHED_AT,
    result_fingerprint: scoringShadowPayloadHash(logicalOddsResult(result)),
  };
  const certification = await certifyOddsCalculationReference({ tournamentId: "2026", jobId: job.job_id, dependencies: {
    readJobs: async () => ({ payload: { ok: true, jobs: [job] } }),
  } });
  assert.equal(certification.ok, true);
  assert.equal(certification.exactEquality, true);
  assert.equal(certification.storedFingerprintValid, true);
  assert.equal(certification.referenceFingerprint, certification.resilientFingerprint);
});

test("Preview SQL provides service-only jobs, claims, checkpoints, retry, supersession, and publication separation", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608220002_preview_championship_odds_execution_resilience.sql", import.meta.url), "utf8");
  for (const table of ["odds_calculation_jobs", "odds_calculation_checkpoints"]) {
    assert.match(migration, new RegExp(`create table scoring_authority\\.${table}`));
    assert.match(migration, new RegExp(`alter table scoring_authority\\.${table} enable row level security`));
  }
  for (const operation of ["request", "claim", "checkpoint", "complete", "fail", "supersede", "mark"]) assert.match(migration, new RegExp(`${operation}_preview_odds_calculation`));
  assert.match(migration, /status in \('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYABLE','SUPERSEDED'\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on function public\.claim_preview_odds_calculation_job\(jsonb\) from public,anon,authenticated/);
  assert.match(migration, /publication_status text not null default 'NOT_REQUESTED'/);
  assert.doesNotMatch(migration, /insert into scoring_authority\.odds_google_mirror_jobs/);
});

test("the Preview worker is asynchronous, protected, zero-fallback, and does not publish or mirror", async () => {
  const [route, service, publishRoute, client, publicRead, warRoomSource] = await Promise.all([
    readFile(new URL("../app/api/odds/calculations/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/championship-odds-resilience.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/odds-center/admin/OddsAdmin.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/published-odds-supabase.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/prediction-input-bundle-source.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /export const maxDuration = 800/);
  assert.match(route, /after\(\(\) => continueCalculation/);
  assert.match(route, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /action === "certify"/);
  assert.match(route, /searchParams\.get\("operation"\).*=== "certify"/s);
  assert.match(route, /publicationCreated: false/);
  assert.doesNotMatch(service, /loadOddsInputs|loadPredictionSheets|historical-data\.json|google-sheets/);
  assert.doesNotMatch(service, /publishSupabaseOddsSnapshot|publishOddsSnapshot|GoogleMirror/);
  assert.match(publishRoute, /readPublishableOddsCalculation/);
  assert.match(publishRoute, /markOddsCalculationPublished/);
  assert.ok(publishRoute.lastIndexOf("deliverSupabaseOddsGoogleMirror") < publishRoute.indexOf("markOddsCalculationPublished(calculationJobId"));
  assert.doesNotMatch(publicRead, /odds_calculation_jobs/);
  assert.doesNotMatch(warRoomSource, /odds_calculation_jobs|championship-odds-resilience/);
  assert.match(client, /You may close this page/);
  assert.match(client, /Publish Completed Official Projection/);
  assert.match(client, /Run non-publishing recovery rehearsal/);
  assert.match(client, /retainForPublication: false/);
});
