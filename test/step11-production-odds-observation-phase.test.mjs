import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  productionOddsCalculationEnvironment,
  productionOddsCalculationScope,
} from "../lib/production-odds-calculation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const SHA = "a".repeat(40);
const PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";

const cutoverEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: SHA,
  VERCEL_PROJECT_ID: PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "OBSERVATION",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: SHA,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PROJECT_ID,
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
  ODDS_PUBLICATION_AUTHORITY: "google",
  PRODUCTION_SUPABASE_WORKERS_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
});

test("Production Odds stays eligible in OBSERVATION while retaining its functional phase", () => {
  const state = productionOddsCalculationEnvironment(cutoverEnv);
  assert.equal(state.allowed, true);
  assert.equal(state.mode, "PRODUCTION_CUTOVER");
  assert.equal(state.activation.phase, "OBSERVATION");

  const scope = productionOddsCalculationScope(cutoverEnv);
  assert.equal(scope.cutover_phase, "ODDS_WAR_ROOM");
  assert.equal(scope.operation_mode, "PRODUCTION_CUTOVER");
  assert.equal(scope.deployment_commit, SHA);
});

test("OBSERVATION re-arm sends the current optimistic revision without relabeling the worker", () => {
  const script = `
    import { configureProductionOddsCalculationRuntime } from
      "./lib/production-odds-calculation-server.js";
    const env = ${JSON.stringify(cutoverEnv)};
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await configureProductionOddsCalculationRuntime({
      enabled: true,
      actorId: "CB01",
      expectedActivationRevision: 9,
      expectedRuntimeRevision: 4,
      expectedRuntimeEnabled: true,
      requestFingerprint: "${"b".repeat(64)}",
    }, { env, fetchImpl });
    process.stdout.write(JSON.stringify(calls));
  `;
  const child = spawnSync(process.execPath, [
    "--conditions=react-server", "--input-type=module", "-e", script,
  ], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const calls = JSON.parse(child.stdout);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url,
    /\/rpc\/configure_production_odds_calculation_runtime$/);
  assert.equal(calls[0].body.input.expected_activation_revision, 9);
  assert.equal(calls[0].body.input.expected_runtime_revision, 4);
  assert.equal(calls[0].body.input.expected_runtime_enabled, true);
  assert.equal(calls[0].body.input.cutover_phase, "ODDS_WAR_ROOM");
  assert.equal(calls[0].body.input.operation_mode, "PRODUCTION_CUTOVER");
  assert.equal(calls[0].body.input.deployment_commit, SHA);
});

test("forward migration accepts at-or-after functional phase but requires exact revision rebind", async () => {
  const [migration, original] = await Promise.all([
    readFile(new URL(
      "../supabase/production_migrations/202608240029_production_odds_observation_phase_rebind.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../supabase/production_migrations/202608240023_production_odds_calculation_orchestration.sql",
      import.meta.url,
    ), "utf8"),
  ]);

  assert.match(migration,
    /create or replace function production_control\.assert_production_odds_calculation_scope\(/i);
  assert.match(migration, /phase <> 'ODDS_WAR_ROOM'/i,
    "the caller cannot relabel the worker as an OBSERVATION-phase worker");
  assert.match(migration,
    /cutover_phase_rank\(activation\.read_cutover_phase\)\s*<\s*production_control\.cutover_phase_rank\(phase\)/i);
  assert.doesNotMatch(migration, /activation\.read_cutover_phase\s*<>\s*phase/i);
  assert.match(migration, /runtime\.cutover_phase <> phase/i);
  assert.match(migration,
    /runtime\.activation_revision <> activation\.activation_revision/i,
    "phase advancement must fail closed until the runtime is rebound");
  assert.match(migration,
    /runtime\.deployment_commit <> activation\.expected_deployment_commit/i);

  const configure = original.slice(
    original.indexOf("create or replace function public.configure_production_odds_calculation_runtime"),
    original.indexOf("create or replace function public.request_production_odds_calculation_job"),
  );
  assert.match(configure,
    /activation\.activation_revision\s*<>\s*coalesce\(\(input->>'expected_activation_revision'\)::bigint, -1\)/i,
    "rebind is optimistic and exact-revision-bound");
  assert.match(configure,
    /set enabled = true, operation_mode = mode, cutover_phase = phase,[\s\S]*activation_revision = activation\.activation_revision/i,
    "re-arm retains functional phase and binds the current revision");
  assert.doesNotMatch(configure,
    /update\s+production_control\.cutover_activation_state/i,
    "rebind may not advance or alter the global authority state");
});

test("observation compatibility remains exact-resource, Google-publication, and non-writing", async () => {
  const migration = await readFile(new URL(
    "../supabase/production_migrations/202608240029_production_odds_observation_phase_rebind.sql",
    import.meta.url,
  ), "utf8");

  for (const exact of [
    PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_URL,
    PRODUCTION_GOOGLE_WORKBOOK_ID,
    PROJECT_ID,
    "https://baggerinv.com",
  ]) assert.match(migration, new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(migration, /assert_exact_cutover_resource_scope\(input, true\)/i);
  assert.match(migration, /resource\.odds_publication_enabled/i);
  assert.match(migration,
    /worker_name = 'ODDS_GOOGLE_MIRROR'[\s\S]*enabled or google_writes_allowed/i);
  assert.match(migration, /worker\.google_writes_allowed/i);
  assert.doesNotMatch(migration,
    /insert into scoring_authority\.odds_published_snapshots|insert into scoring_authority\.odds_google_mirror_jobs|sheets\.googleapis|docs\.google\.com|net\.http_|pg_net|cron\./i);
  assert.doesNotMatch(migration,
    /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/i);
  assert.match(migration, /^--[\s\S]*\nbegin;\n/i);
  assert.match(migration, /notify pgrst, 'reload schema';\ncommit;\n$/i);
  assert.equal((migration.match(/\$\$/g) || []).length % 2, 0);
  assert.equal((migration.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((migration.match(/\bcommit;/gi) || []).length, 1);
});
