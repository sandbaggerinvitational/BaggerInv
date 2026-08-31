import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertProductionOddsStoredJobScope,
  productionOddsCalculationScope,
} from "../lib/production-odds-calculation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const sql = await readFile(new URL(
  "../supabase/production_migrations/202608300073_production_annual_odds_v1.sql",
  import.meta.url,
), "utf8");

const sha = "a".repeat(40);
const runtimeGenerationId = "10000000-0000-4000-8000-000000000001";
const authorityGenerationId = "20000000-0000-4000-8000-000000000002";
const admissionGenerationId = "30000000-0000-4000-8000-000000000003";
const writerGenerationId = "40000000-0000-4000-8000-000000000004";
const epochId = "50000000-0000-4000-8000-000000000005";
const annualWorkbook = "future-certified-odds-workbook-2027";

const env = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: sha,
  VERCEL_DEPLOYMENT_ID: "dpl_AnnualOdds2027",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: sha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}`,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
  ODDS_PUBLICATION_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_WORKERS_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT:
    "production-maintenance-single-deployment-capability-v1",
  PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING: "OBSERVATION",
  PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: epochId,
});

const futureRuntimeContext = Object.freeze({
  frozen2026: false,
  runtime: Object.freeze({
    tournamentId: "2027",
    tournamentYear: 2027,
    pointerRevision: 2,
    runtimeGenerationId,
    authorityGenerationId,
    admissionGenerationId,
  }),
  googleDestination: Object.freeze({
    contractVersion: "production-annual-google-destination-v1",
    tournamentId: "2027",
    writerGenerationId,
    destinationWorkbookId: annualWorkbook,
    targetContractFingerprint: "b".repeat(64),
  }),
});

test("annual Odds scope is server-selected and cannot be replaced by caller input", () => {
  const scope = productionOddsCalculationScope(env, {
    environment: "PREVIEW",
    tournament_id: "2099",
    target_tournament_id: "2099",
    target_tournament_year: 2099,
    expected_runtime_generation_id:
      "90000000-0000-4000-8000-000000000009",
    annual_destination_workbook_id: "attacker-workbook",
    annual_odds_operation: "read_production_odds_calculation_inputs",
    authorization: { tournament_id: "2099", player_id: "CB01" },
  }, futureRuntimeContext);

  assert.equal(scope.environment, "PRODUCTION");
  assert.equal(scope.tournament_id, "2026",
    "the annual dispatcher retains the certified Step-12 platform tuple");
  assert.equal(scope.target_tournament_id, "2027");
  assert.equal(scope.tournament_year, 2026);
  assert.equal(scope.target_tournament_year, 2027);
  assert.equal(scope.expected_current_tournament_id, "2027");
  assert.equal(scope.expected_pointer_revision, 2);
  assert.equal(scope.expected_runtime_generation_id, runtimeGenerationId);
  assert.equal(scope.expected_annual_authority_generation_id,
    authorityGenerationId);
  assert.equal(scope.expected_annual_admission_generation_id,
    admissionGenerationId);
  assert.equal(scope.expected_google_writer_generation_id,
    writerGenerationId);
  assert.equal(scope.annual_destination_workbook_id, annualWorkbook);
  assert.equal(scope.authorization.tournament_id, "2027");
  assert.equal(scope.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID,
    "the frozen platform workbook remains attestation evidence only");

  const frozen = productionOddsCalculationScope(env, {
    tournament_id: "2099",
  });
  assert.equal(frozen.tournament_id, "2026");
  assert.equal(frozen.tournament_year, 2026);
  assert.equal(Object.hasOwn(frozen, "annual_scoring_dispatch_contract"), false);
  assert.equal(Object.hasOwn(frozen, "expected_runtime_generation_id"), false);
});

test("future retained Odds jobs are isolated by tournament and runtime generation", () => {
  const sourceRevision = {
    production_job_identity_contract:
      "production-odds-calculation-job-identity-v2",
    annual_odds_contract: "production-annual-odds-dispatch-v1",
    annual_tournament_id: "2027",
    annual_pointer_revision: 2,
    annual_runtime_generation_id: runtimeGenerationId,
    annual_authority_generation_id: authorityGenerationId,
    annual_admission_generation_id: admissionGenerationId,
  };
  const job = {
    tournament_id: "2027",
    runtime_generation_id: runtimeGenerationId,
    production_operation_mode: "PRODUCTION_CUTOVER",
    production_deployment_commit: sha,
    production_candidate_hostname: null,
    publication_status: "READY",
    status: "SUCCEEDED",
    source_revision: sourceRevision,
  };
  const isolation = assertProductionOddsStoredJobScope(
    job,
    env,
    futureRuntimeContext,
  );
  assert.equal(isolation.tournamentId, "2027");
  assert.equal(isolation.runtimeGenerationId, runtimeGenerationId);
  assert.equal(isolation.publicationEligible, true);

  for (const changed of [
    { tournament_id: "2026" },
    { runtime_generation_id: "90000000-0000-4000-8000-000000000009" },
    { source_revision: { ...sourceRevision, annual_tournament_id: "2028" } },
    { source_revision: {
      ...sourceRevision,
      annual_runtime_generation_id:
        "90000000-0000-4000-8000-000000000009",
    } },
  ]) {
    assert.throws(
      () => assertProductionOddsStoredJobScope(
        { ...job, ...changed },
        env,
        futureRuntimeContext,
      ),
      (error) => error.code === "PRODUCTION_ODDS_JOB_SCOPE_MISMATCH",
    );
  }
});

test("application dispatcher preserves the frozen 2026 RPC and binds future calls to one annual RPC", () => {
  const script = `
    import { productionCurrentOddsCalculationRpc } from
      "./lib/production-odds-calculation-server.js";
    const env = ${JSON.stringify(env)};
    const future = ${JSON.stringify(futureRuntimeContext)};
    const frozen = { frozen2026: true,
      runtime: { tournamentId: "2026", tournamentYear: 2026 },
      googleDestination: null };
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    await productionCurrentOddsCalculationRpc(
      "read_production_odds_calculation_inputs",
      { tournament_id: "2099", target_tournament_id: "2099" },
      { env, runtimeContext: frozen, fetchImpl },
    );
    await productionCurrentOddsCalculationRpc(
      "read_production_odds_calculation_inputs",
      { tournament_id: "2099", target_tournament_id: "2099" },
      { env, runtimeContext: future, fetchImpl },
    );
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
  assert.match(calls[0].url,
    /\/rpc\/read_production_odds_calculation_inputs$/);
  assert.equal(calls[0].body.input.tournament_id, "2026");
  assert.match(calls[1].url,
    /\/rpc\/dispatch_production_annual_scoring_v1$/);
  assert.equal(calls[1].body.input.annual_scoring_operation,
    "dispatch_production_annual_odds_v1");
  assert.equal(calls[1].body.input.annual_odds_operation,
    "read_production_odds_calculation_inputs");
  assert.equal(calls[1].body.input.tournament_id, "2026");
  assert.equal(calls[1].body.input.tournament_year, 2026);
  assert.equal(calls[1].body.input.target_tournament_id, "2027");
  assert.equal(calls[1].body.input.target_tournament_year, 2027);
  assert.equal(calls[1].body.input.expected_runtime_generation_id,
    runtimeGenerationId);
  assert.equal(calls[1].body.input.annual_destination_workbook_id,
    annualWorkbook);
});

test("2026 publication request identity remains byte-compatible while future identity is target-bound", () => {
  const args = {
    jobId: "c".repeat(64),
    expectedPublicationRevision: 3,
    expectedSnapshotId: "60000000-0000-4000-8000-000000000006",
    expectedActivationRevision: 117,
    expectedAuthorityEpochId: epochId,
    actorAuthUserId: "70000000-0000-4000-8000-000000000007",
    actorPlayerId: "CB01",
  };
  const expected2026 = createHash("sha256").update([
    "production-odds-publication-v1",
    "PUBLISH",
    "2026",
    args.jobId,
    String(args.expectedActivationRevision),
    args.expectedAuthorityEpochId,
    args.actorAuthUserId,
    args.actorPlayerId,
  ].join("\n")).digest("hex");
  const script = `
    import { productionOddsPublicationRequestFingerprint } from
      "./lib/production-odds-publication-server.js";
    const args = ${JSON.stringify(args)};
    process.stdout.write(JSON.stringify({
      frozen: productionOddsPublicationRequestFingerprint(args),
      annual: productionOddsPublicationRequestFingerprint({
        ...args, tournamentId: "2027",
      }),
    }));
  `;
  const child = spawnSync(process.execPath, [
    "--conditions=react-server", "--input-type=module", "-e", script,
  ], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const fingerprints = JSON.parse(child.stdout);
  assert.equal(fingerprints.frozen, expected2026);
  assert.notEqual(fingerprints.annual, expected2026);
});

test("migration is inert, service-only, phase-correct, and fences every frozen 2026 Odds entry", () => {
  assert.match(sql, /^--[\s\S]*\nbegin;\n/);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.match(sql, /required_phase in \([\s\S]*'ODDS_WAR_ROOM'/);
  assert.match(sql, /'dispatch_production_annual_odds_v1',[\s\S]*'ODDS_WAR_ROOM',[\s\S]*'MUTATION'/);
  assert.match(sql, /assert_annual_scoring_runtime_v1\([\s\S]*'dispatch_production_annual_odds_v1'/);
  assert.match(sql, /pg_advisory_xact_lock_shared\([\s\S]*scoring_admission_lock_key/);
  assert.match(sql, /PRODUCTION_LEGACY_ODDS_POINTER_CHANGED/);
  assert.match(sql, /assert_frozen_2026_current_read_v1/);
  assert.match(sql, /read_published_odds_view_frozen_2026_v1/);
  assert.match(sql, /annual_odds_2026_body_certifications_v1/);
  assert.match(sql, /runtime_generation_id[\s\S]*expected_runtime_generation_id/);
  assert.match(sql, /where value\.tournament_id = target[\s\S]*value\.runtime_generation_id/);
  assert.match(sql, /input->>'tournament_id' is distinct from '2026'/);
  assert.match(sql, /input->>'target_tournament_id' is distinct from target/);
  assert.match(sql, /input->>'target_tournament_year'[\s\S]*annual_catalog\.tournament_year/);
  assert.match(sql, /google_publication_fallback'[\s\S]*false[\s\S]*google_mirror'[\s\S]*'RETIRED'/);
  assert.match(sql, /mirror_created', false, 'google_writes', 0/);
  assert.doesNotMatch(sql, /grant execute on function public\.future_production_dispatch_odds_v1[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.dispatch_production_annual_odds_v1\(jsonb\)[\s\S]*to service_role/i);
});
