import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildOddsCalculationInvocation,
  processOddsCalculationJob,
} from "../lib/championship-odds-resilience.js";
import { logicalOddsResult } from "../lib/championship-odds-supabase.js";
import {
  PRODUCTION_ODDS_CALCULATION_MODES,
  assertProductionOddsCalculationEnvironment,
  productionOddsCalculationDependencies,
  productionOddsCalculationEnvironment,
  productionOddsCalculationRequestInput,
} from "../lib/production-odds-calculation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";
import {
  ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
  createTournamentOddsCheckpoint,
} from "../lib/tournament-odds.js";
import {
  championshipOddsResilienceFixture,
  RESILIENCE_PHASE,
  RESILIENCE_PUBLISHED_AT,
} from "./fixtures/championship-odds-resilience.mjs";

const PRODUCTION_VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
const candidateHostname = "bagger-production-step11-odds.vercel.app";
const sha = "a".repeat(40);
const h = (character) => character.repeat(64);

const candidateEnv = Object.freeze({
  VERCEL_ENV: "preview",
  VERCEL_URL: "bagger-production-step11-odds-deploy.vercel.app",
  VERCEL_BRANCH_URL: candidateHostname,
  VERCEL_GIT_COMMIT_SHA: sha,
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: candidateHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: sha,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "production-server-credential-never-serialized",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-browser-publishable-key",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "production-auth-rate-limit-only-secret",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
  ODDS_PUBLICATION_AUTHORITY: "google",
  PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED: "false",
  PRODUCTION_STEP11_ODDS_REHEARSAL_ENABLED: "true",
  PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET: "production-step11-odds-rehearsal-secret-only",
});

function canonicalInputs() {
  return {
    ...championshipOddsResilienceFixture(),
    configuration: productionConfiguration(),
    metadata: {
      settingsFingerprint: h("1"),
      sourceRevision: { currentTournamentRevision: 3 },
      sourceFingerprint: h("2"),
      pairingFingerprint: h("3"),
      configurationRevision: 4,
    },
  };
}

function productionConfiguration() {
  return {
    id: "00000000-0000-4000-8000-000000000023",
    configuration_revision: 4,
    source_fingerprint: h("2"),
    bundle_fingerprint: h("4"),
    settings_fingerprint: h("1"),
    effective_settings_fingerprint: h("5"),
    ratings_fingerprint: h("6"),
    pairing_fingerprint: h("3"),
  };
}

test("Step 11 Production Odds gate requires the exact isolated candidate and keeps publication Google", () => {
  const ready = productionOddsCalculationEnvironment(candidateEnv);
  assert.equal(ready.allowed, true);
  assert.equal(ready.mode, PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL);
  assert.equal(ready.deploymentCommit, sha);
  assert.equal(ready.candidateHostname, candidateHostname);

  for (const invalid of [
    { VERCEL_PROJECT_ID: "prj_wrong" },
    { PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" },
    { GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" },
    { ODDS_PUBLICATION_AUTHORITY: "supabase" },
    { PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED: "true" },
    { PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET: "short" },
  ]) {
    const state = productionOddsCalculationEnvironment({ ...candidateEnv, ...invalid });
    assert.equal(state.allowed, false, JSON.stringify(invalid));
    assert.throws(
      () => assertProductionOddsCalculationEnvironment({ ...candidateEnv, ...invalid }),
      (error) => error.code === "PRODUCTION_ODDS_CALCULATION_UNAVAILABLE",
    );
  }
});

test("Production request identity binds exact resources, frozen inputs, CURRENT settings, and canonical hashes", () => {
  const invocation = buildOddsCalculationInvocation({
    inputs: canonicalInputs(),
    phase: RESILIENCE_PHASE,
    iterations: 10_000,
    requestedBy: "CB01",
    outputTimestamp: RESILIENCE_PUBLISHED_AT,
  });
  const input = productionOddsCalculationRequestInput({
    invocation,
    configuration: productionConfiguration(),
    env: candidateEnv,
  });
  assert.equal(input.environment, "PRODUCTION");
  assert.equal(input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(input.project_url, PRODUCTION_SUPABASE_URL);
  assert.equal(input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(input.deployment_commit, sha);
  assert.equal(input.vercel_project_id, PRODUCTION_VERCEL_PROJECT_ID);
  assert.equal(input.operation_mode, "STEP11_REHEARSAL");
  assert.equal(input.cutover_phase, "ODDS_WAR_ROOM");
  assert.equal(input.settings_fingerprint, h("1"));
  assert.equal(input.effective_settings_fingerprint, h("5"));
  assert.equal(input.input_bundle_fingerprint, h("4"));
  assert.equal(scoringShadowPayloadHash(JSON.parse(input.input_snapshot_canonical_json)), input.input_fingerprint);
  assert.equal(scoringShadowPayloadHash(JSON.parse(input.checkpoint_canonical_json)), input.checkpoint_hash);
  assert.equal(scoringShadowPayloadHash(JSON.parse(input.invocation_canonical_json)), input.job_id);

  assert.throws(
    () => productionOddsCalculationRequestInput({
      invocation,
      configuration: { ...productionConfiguration(), bundle_fingerprint: "bad" },
      env: candidateEnv,
    }),
    (error) => error.code === "PRODUCTION_ODDS_INPUT_REVISION_REQUIRED",
  );
});

function fakeProductionJob(totalIterations = 180) {
  const inputs = canonicalInputs();
  const checkpoint = createTournamentOddsCheckpoint({
    ...inputs,
    phase: RESILIENCE_PHASE,
    iterations: totalIterations,
  });
  return {
    job_id: h("a"),
    tournament_id: "2026",
    phase: RESILIENCE_PHASE,
    total_iterations: totalIterations,
    completed_iterations: 0,
    status: "PENDING",
    attempt_count: 0,
    checkpoint_count: 0,
    checkpoint_payload: checkpoint,
    checkpoint_hash: scoringShadowPayloadHash(checkpoint),
    checkpoint_contract_version: ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
    input_snapshot: JSON.parse(JSON.stringify(inputs)),
    resource_metrics: {},
    output_timestamp: RESILIENCE_PUBLISHED_AT,
    publication_status: "NOT_REQUESTED",
    publication_reference: {},
  };
}

function inMemoryProductionTransport(initialJob) {
  const state = {
    job: structuredClone(initialJob),
    checkpoints: [],
    attempts: [],
    publications: 0,
    mirrors: 0,
  };
  const call = async (functionName, input) => {
    assert.equal(input.environment, "PRODUCTION");
    assert.equal(input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
    assert.equal(input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
    assert.equal(input.deployment_commit, sha);
    assert.equal(input.operation_mode, "STEP11_REHEARSAL");
    state.attempts.push(functionName);
    if (functionName === "claim_production_odds_calculation_job") {
      if (state.job.status === "SUCCEEDED") {
        return { payload: { ok: true, deliver: false, completed: true, job: structuredClone(state.job) } };
      }
      state.job.status = "RUNNING";
      state.job.attempt_count += 1;
      state.job.claim_token = `00000000-0000-4000-8000-${String(state.job.attempt_count).padStart(12, "0")}`;
      return { payload: { ok: true, deliver: true, job: structuredClone(state.job) } };
    }
    if (functionName === "checkpoint_production_odds_calculation_job") {
      assert.equal(JSON.parse(input.checkpoint_canonical_json).completedIterations, input.completed_iterations);
      assert.equal(scoringShadowPayloadHash(input.checkpoint_payload), input.checkpoint_hash);
      state.job.completed_iterations = input.completed_iterations;
      state.job.checkpoint_payload = structuredClone(input.checkpoint_payload);
      state.job.checkpoint_hash = input.checkpoint_hash;
      state.job.checkpoint_count += 1;
      state.checkpoints.push(input.completed_iterations);
      return { payload: { ok: true, checkpoint_count: state.job.checkpoint_count } };
    }
    if (functionName === "complete_production_odds_calculation_job") {
      assert.equal(scoringShadowPayloadHash(input.result_fingerprint_payload), input.result_fingerprint);
      assert.deepEqual(input.result_fingerprint_payload, logicalOddsResult(input.result_payload));
      state.job.status = "SUCCEEDED";
      state.job.result_payload = structuredClone(input.result_payload);
      state.job.result_fingerprint = input.result_fingerprint;
      state.job.publication_status = "READY";
      state.job.publication_reference = {};
      state.job.claim_token = null;
      return { payload: {
        ok: true,
        duplicate: false,
        checkpoint_count: state.job.checkpoint_count,
        attempt_count: state.job.attempt_count,
        publication_created: false,
        mirror_created: false,
      } };
    }
    if (functionName === "fail_production_odds_calculation_job") {
      if (state.job.status !== "SUCCEEDED") {
        state.job.status = "RETRYABLE";
        state.job.claim_token = null;
        return { payload: { ok: true, marked: true, retryable: true } };
      }
      return { payload: { ok: true, marked: false, stale_claim: true } };
    }
    throw new Error(`Unexpected RPC ${functionName}`);
  };
  return { state, dependencies: productionOddsCalculationDependencies(candidateEnv, call) };
}

test("Production worker resumes from interruption, preserves PRNG state, and cannot publish or mirror", async () => {
  const memory = inMemoryProductionTransport(fakeProductionJob());
  await assert.rejects(
    () => processOddsCalculationJob(memory.state.job.job_id, {
      chunkIterations: 60,
      failureAt: "AFTER_CHECKPOINT",
      dependencies: memory.dependencies,
    }),
    /Injected failure after a durable checkpoint/,
  );
  assert.equal(memory.state.job.status, "RETRYABLE");
  assert.deepEqual(memory.state.checkpoints, [60]);
  const completed = await processOddsCalculationJob(memory.state.job.job_id, {
    chunkIterations: 60,
    dependencies: memory.dependencies,
  });
  assert.equal(completed.completed, true);
  assert.equal(memory.state.job.status, "SUCCEEDED");
  assert.equal(memory.state.job.attempt_count, 2);
  assert.equal(memory.state.job.publication_status, "READY");
  assert.deepEqual(memory.state.job.publication_reference, {});
  assert.equal(memory.state.publications, 0);
  assert.equal(memory.state.mirrors, 0);
  const replay = await processOddsCalculationJob(memory.state.job.job_id, {
    chunkIterations: 60,
    dependencies: memory.dependencies,
  });
  assert.equal(replay.processed, false);
  assert.equal(replay.completed, true);
  assert.equal(memory.state.attempts.filter((name) => name === "complete_production_odds_calculation_job").length, 1);
});

test("Production SQL is exact-scope, service-only, idempotent, stale-aware, and inert on install", async () => {
  const sql = await readFile(new URL(
    "../supabase/production_migrations/202608240023_production_odds_calculation_orchestration.sql",
    import.meta.url,
  ), "utf8");
  const server = await readFile(new URL(
    "../lib/production-odds-calculation-server.js",
    import.meta.url,
  ), "utf8");

  for (const exact of [
    PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_URL,
    PRODUCTION_GOOGLE_WORKBOOK_ID,
    PRODUCTION_VERCEL_PROJECT_ID,
    "https://baggerinv.com",
  ]) assert.match(sql, new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.match(sql, /perform production_control\.assert_exact_cutover_resource_scope\(input, true\)/);
  assert.match(sql, /activation\.state <> 'STAGED'/);
  assert.match(sql, /activation\.state <> 'SCORING_COMMITTED'/);
  assert.match(sql, /phase <> 'ODDS_WAR_ROOM'/);
  assert.match(sql, /activation\.read_cutover_phase <> phase/);
  assert.match(sql, /PRODUCTION_PREDICTION_SETTINGS_NOT_CURRENT/);
  assert.match(sql, /PRODUCTION_ODDS_INPUT_REVISION_STALE/);
  assert.match(sql, /PRODUCTION_ODDS_CALCULATION_BASELINE_NOT_DORMANT/);
  assert.match(sql, /config := production_control\.current_production_odds_inputs\(/);
  assert.match(sql, /for update/);
  assert.match(sql, /lease_expires_at = now\(\) \+ interval '12 minutes'/);
  assert.match(sql, /ODDS_CALCULATION_CHECKPOINT_CONFLICT/);
  assert.match(sql, /ODDS_CALCULATION_CLAIM_STALE/);
  assert.match(sql, /status = 'SUPERSEDED', publication_status = 'STALE'/);
  assert.match(sql, /publication_status = 'READY'/);
  assert.match(sql, /production_odds_initial_publication_separation_check/);
  assert.doesNotMatch(sql, /insert into scoring_authority\.odds_published_snapshots/i);
  assert.doesNotMatch(sql, /insert into scoring_authority\.odds_google_mirror_jobs/i);
  assert.doesNotMatch(sql, /mark_production_odds_calculation_published/i);
  assert.doesNotMatch(sql, /cron\.|net\.http_|pg_net|sheets\.googleapis|docs\.google\.com/i);
  assert.match(sql, /enabled boolean not null default false/);
  assert.match(sql, /operation_mode text not null default 'DORMANT'/);
  for (const rpc of ["configure", "request", "claim", "checkpoint", "complete", "fail", "supersede", "read"]) {
    assert.match(sql, new RegExp(`public\\.${rpc}_production_odds_calculation`));
  }
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (?:public|anon|authenticated)/i);
  assert.match(server, /import "server-only"/);
  assert.match(server, /RPC_ALLOWLIST/);
  assert.doesNotMatch(server, /publishSupabaseOddsSnapshot|markOddsCalculationPublished|GoogleMirror/);
});

test("Production Odds GET is read-only while same-origin POST owns every calculation mutation", async () => {
  const [route, authorization] = await Promise.all([
    readFile(new URL(
      "../app/api/admin/production-odds-calculations/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../lib/preview-director-authorization.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /assertProductionShadowCandidateRequest/);
  assert.match(route, /assertProductionCutoverRequest/);
  assert.match(route, /x-step11-rehearsal-token/);
  assert.match(route, /PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /allowBootstrap:\s*false/);
  const getHandler = route.slice(
    route.indexOf("export async function GET"),
    route.indexOf("export async function POST"),
  );
  const postHandler = route.slice(route.indexOf("export async function POST"));
  assert.match(getHandler, /authorizeRequest\(request, state, \{ requireOrigin: false \}\)/);
  assert.doesNotMatch(getHandler,
    /continueCalculation|processProductionOddsCalculationJob|certifyProductionOddsCalculation|requestProductionOddsCalculation|after\s*\(/);
  assert.doesNotMatch(getHandler, /operation.*certify|leaseExpired/s);
  assert.match(postHandler, /authorizeRequest\(request, state, \{ requireOrigin: true \}\)/);
  assert.match(postHandler, /action === "certify"/);
  assert.match(postHandler, /action === "retry"/);
  assert.match(postHandler, /after\(\(\) => continueCalculation/);
  assert.match(postHandler, /requestProductionOddsCalculation/);
  assert.match(route, /export const maxDuration = 800/);
  assert.match(route, /publicationCreated:\s*false/);
  assert.match(route, /mirrorCreated:\s*false/);
  assert.match(authorization, /"\/api\/admin\/production-odds-calculations"/);
  assert.doesNotMatch(route, /publishSupabaseOddsSnapshot|markOddsCalculationPublished|deliverSupabaseOddsGoogleMirror/);
  assert.doesNotMatch(route, /google-sheets-write|sheets\.googleapis|docs\.google\.com/);
});
