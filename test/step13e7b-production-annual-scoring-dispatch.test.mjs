import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from
  "../lib/production-cutover-activation-contract.js";

async function importAnnualScoringTransport() {
  const source = await readFile(new URL(
    "../lib/production-scoring-operations-server.js", import.meta.url,
  ), "utf8");
  const activationStub = `
const PRODUCTION_VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
function assertProductionCutoverActivation({ env, requiredPhase }) {
  return {
    phase: requiredPhase,
    resources: { commitSha: String(env.VERCEL_GIT_COMMIT_SHA || "") },
    maintenanceDeploymentCapability: { allowed: false, contract: "", ceiling: "" },
  };
}`;
  const foundationStub = `
const PRODUCTION_GOOGLE_WORKBOOK_ID = "${PRODUCTION_GOOGLE_WORKBOOK_ID}";
const PRODUCTION_SUPABASE_PROJECT_REF = "${PRODUCTION_SUPABASE_PROJECT_REF}";
const PRODUCTION_SUPABASE_URL = "${PRODUCTION_SUPABASE_URL}";
const PRODUCTION_TOURNAMENT_ID = "2026";`;
  const currentRuntimeStub = `
async function readProductionCurrentTournamentRuntime() {
  throw new Error("test must inject current runtime");
}`;
  const shadowStub = `
const PRODUCTION_CANONICAL_HOSTNAME = "baggerinv.com";
const PRODUCTION_VERCEL_PROJECT_NAME = "bagger-inv";`;
  const authorityStub = `
function recordDataAuthorityTransport() {}`;
  const transformed = source
    .replace('import "server-only";\n', "")
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-cutover-activation-contract\.js";/,
      activationStub,
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-foundation-resource-contract\.js";/,
      foundationStub,
    )
    .replace(
      /import \{ readProductionCurrentTournamentRuntime \} from "\.\/production-current-tournament-runtime\.js";/,
      currentRuntimeStub,
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-shadow-candidate\.js";/,
      shadowStub,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      authorityStub,
    );
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

const {
  productionScoringDispatchGoogleResources,
  productionScoringOperationsRpc,
  resolveProductionScoringDispatchContext,
} = await importAnnualScoringTransport();

const commit = "a".repeat(40);
const deploymentId = "dpl_annual_scoring_dispatch_test";
const epochId = "11111111-1111-4111-8111-111111111111";
const runtimeGenerationId = "22222222-2222-4222-8222-222222222222";
const authorityGenerationId = "33333333-3333-4333-8333-333333333333";
const admissionGenerationId = "44444444-4444-4444-8444-444444444444";
const writerGenerationId = "55555555-5555-4555-8555-555555555555";
const resourceFingerprint = "6".repeat(64);
const certificationFingerprint = "7".repeat(64);
const targetContractFingerprint = "8".repeat(64);
const implementationFingerprint = "9".repeat(64);

const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commit,
  VERCEL_DEPLOYMENT_ID: deploymentId,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}`,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: epochId,
});

const certification = Object.freeze({
  contractVersion: "production-annual-scoring-platform-certification-v1",
  platformTournamentId: "2026",
  resourceFingerprint,
  certificationFingerprint,
  platformAuthorityGenerationId: authorityGenerationId,
  platformAdmissionGenerationId: admissionGenerationId,
});

const frozenRuntime = Object.freeze({
  contractVersion: "production-current-tournament-runtime-v1",
  status: "FROZEN_2026_RUNTIME",
  tournamentId: "2026",
  tournamentYear: 2026,
  lifecycle: "ACTIVE",
  pointerRevision: 1,
  lifecycleRevision: 1,
  runtimeGenerationId: "",
  authorityGenerationId: "",
  admissionGenerationId: "",
});

const futureRuntime = Object.freeze({
  contractVersion: "production-current-tournament-runtime-v1",
  status: "ANNUAL_ACTIVE_RUNTIME",
  tournamentId: "2027",
  tournamentYear: 2027,
  lifecycle: "ACTIVE",
  pointerRevision: 2,
  lifecycleRevision: 4,
  runtimeGenerationId,
  authorityGenerationId,
  admissionGenerationId,
});

const destination = Object.freeze({
  contractVersion: "production-annual-google-destination-v1",
  tournamentId: "2027",
  writerGenerationId,
  destinationWorkbookId: "annual-workbook-2027",
  targetContractFingerprint,
  implementationFingerprint,
});

const jsonResponse = (payload = { ok: true }) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

test("pointer 2026 preserves the exact legacy RPC and serialized input body", async () => {
  const requestInput = {
    match_id: "2026-R1-1",
    hole_number: 7,
    authorization: { tournament_id: "2026", player_id: "CB01" },
  };
  let request;
  const result = await productionScoringOperationsRpc(
    "submit_production_hole_score",
    requestInput,
    {
      env: baseEnv,
      readCurrentTournamentRuntime: async () => frozenRuntime,
      readScoringPlatformCertification: async () => certification,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return jsonResponse({
          ok: true,
          code: "HOLE_SCORE_RECORDED",
          revision: 19,
          idempotent: true,
        });
      },
    },
  );
  const expectedInput = {
    ...requestInput,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: "2026",
    deployment_commit: commit,
    deployment_id: deploymentId,
    deployment_capability_contract: "",
    deployment_capability_ceiling: "",
    expected_epoch_id: epochId,
  };
  assert.equal(
    request.url,
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/submit_production_hole_score`,
  );
  assert.equal(request.options.body, JSON.stringify({ input: expectedInput }));
  assert.deepEqual(result.payload, {
    ok: true,
    code: "HOLE_SCORE_RECORDED",
    revision: 19,
    idempotent: true,
  });
});

test("future scoring strips caller annual authority and uses one certified dispatcher", async () => {
  let request;
  await productionScoringOperationsRpc("finalize_production_match", {
    match_id: "2027-R1-1",
    target_tournament_id: "2099",
    current_tournament_id: "2099",
    expected_current_tournament_id: "2099",
    expected_pointer_revision: 999,
    expected_runtime_generation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expected_annual_authority_generation_id:
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    expected_annual_admission_generation_id:
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    expected_google_writer_generation_id:
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    annual_destination_workbook_id: "caller-workbook",
    expected_google_target_contract_fingerprint: "e".repeat(64),
    authorization: { tournament_id: "2099", player_id: "CB01" },
  }, {
    env: baseEnv,
    readCurrentTournamentRuntime: async () => futureRuntime,
    readScoringPlatformCertification: async () => certification,
    readAnnualScoringGoogleDestination: async () => destination,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ ok: true, revision: 20 });
    },
  });
  assert.equal(
    request.url,
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/dispatch_production_annual_scoring_v1`,
  );
  const body = JSON.parse(request.options.body).input;
  assert.equal(body.annual_scoring_operation, "finalize_production_match");
  assert.equal(body.tournament_id, "2026");
  assert.equal(body.authorization.tournament_id, "2027");
  assert.equal(body.expected_current_tournament_id, "2027");
  assert.equal(body.expected_pointer_revision, 2);
  assert.equal(body.expected_runtime_generation_id, runtimeGenerationId);
  assert.equal(body.expected_annual_authority_generation_id, authorityGenerationId);
  assert.equal(body.expected_annual_admission_generation_id, admissionGenerationId);
  assert.equal(body.expected_google_writer_generation_id, writerGenerationId);
  assert.equal(body.annual_destination_workbook_id, "annual-workbook-2027");
  assert.equal(
    body.expected_google_target_contract_fingerprint,
    targetContractFingerprint,
  );
  assert.equal("target_tournament_id" in body, false);
  assert.doesNotMatch(request.options.body, /2099|caller-workbook|dddddddd/);
});

test("preactivation compatibility remains a direct certified server RPC", async () => {
  let request;
  await productionScoringOperationsRpc(
    "resolve_production_future_match_google_compatibility_v2",
    { target_tournament_id: "2027", writer_generation_id: writerGenerationId },
    {
      env: { ...baseEnv, PRODUCTION_CUTOVER_PHASE: "WORKERS" },
      fetchImpl: async (url, options) => {
        request = { url, options };
        return jsonResponse({ ok: true });
      },
    },
  );
  assert.equal(
    request.url,
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/resolve_production_future_match_google_compatibility_v2`,
  );
  const body = JSON.parse(request.options.body).input;
  assert.equal(body.target_tournament_id, "2027");
  assert.equal(body.writer_generation_id, writerGenerationId);
  assert.equal(body.annual_scoring_dispatch_contract, undefined);
});

test("Google worker resources require the branded exact annual context", async () => {
  const env = { ...baseEnv, PRODUCTION_CUTOVER_PHASE: "WORKERS" };
  const context = await resolveProductionScoringDispatchContext({
    requiredPhase: "WORKERS",
    env,
    readCurrentTournamentRuntime: async () => futureRuntime,
    readScoringPlatformCertification: async () => certification,
    readAnnualScoringGoogleDestination: async () => destination,
  });
  const resources = productionScoringDispatchGoogleResources(context, {
    requiredPhase: "WORKERS",
    env,
  });
  assert.equal(resources.tournamentId, "2027");
  assert.equal(resources.tournamentYear, 2027);
  assert.equal(resources.googleWorkbookId, "annual-workbook-2027");
  assert.equal(resources.platformGoogleWorkbookId, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(resources.writerGenerationId, writerGenerationId);
  assert.equal(resources.googleTargetContractFingerprint, targetContractFingerprint);
  assert.throws(
    () => productionScoringDispatchGoogleResources(
      JSON.parse(JSON.stringify(context)), { requiredPhase: "WORKERS", env },
    ),
    (error) => error.code === "PRODUCTION_SCORING_DISPATCH_CONTEXT_INVALID",
  );
  assert.throws(
    () => productionScoringDispatchGoogleResources(context, {
      requiredPhase: "SCORING_COMMIT", env,
    }),
    (error) => error.code === "PRODUCTION_SCORING_DISPATCH_CONTEXT_INVALID",
  );
  assert.throws(
    () => productionScoringDispatchGoogleResources(context, {
      requiredPhase: "WORKERS",
      env: { ...env, VERCEL_DEPLOYMENT_ID: "dpl_moved" },
    }),
    (error) => error.code === "PRODUCTION_SCORING_DISPATCH_CONTEXT_INVALID",
  );
});
