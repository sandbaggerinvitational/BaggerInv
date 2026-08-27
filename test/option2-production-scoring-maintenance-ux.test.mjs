import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  isScoringAdmissionPause,
  isScoringMaintenancePause,
  participantScoringError,
  participantScoringHttpStatus,
  participantScoringPauseHeaders,
} from "../lib/scoring-api-errors.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from
  "../lib/production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { productionGoogleDrivePrincipalFingerprint } from
  "../lib/google-service-account-credential-context.js";

const root = new URL("..", import.meta.url);

test("maintenance inspection fails closed with an explicit non-retryable scoring response", () => {
  const error = Object.assign(new Error("internal maintenance state"), {
    code: "PRODUCTION_SCORING_MAINTENANCE_ACTIVE",
    status: 503,
  });
  assert.equal(isScoringMaintenancePause(error), true);
  assert.equal(isScoringAdmissionPause(error), true);
  assert.equal(participantScoringHttpStatus(error), 503);
  assert.equal(
    participantScoringError(error),
    "Scoring is temporarily paused for scheduled maintenance. Refresh after the maintenance window.",
  );
  assert.deepEqual(participantScoringPauseHeaders(error), {
    "Cache-Control": "no-store",
    "X-Scoring-Admission": "paused",
    "X-Scoring-Maintenance": "active",
    "X-Scoring-Action": "refresh-required",
  });

  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const authorityGeneration = "11111111-1111-4111-8111-111111111111";
  const admissionGeneration = "22222222-2222-4222-8222-222222222222";
  const deploymentId = "dpl_12345678Test";
  const commit = "a".repeat(40);
  const principal = productionGoogleDrivePrincipalFingerprint("legacy-writer@example.invalid");
  const script = `
    import {
      inspectProductionScoringMutationAuthority,
      withProductionGoogleAuthorityWrite,
    } from ${JSON.stringify(ingressUrl)};

    process.env.NODE_TEST_CONTEXT = "child-v8";
    const authorityGeneration = ${JSON.stringify(authorityGeneration)};
    const admissionGeneration = ${JSON.stringify(admissionGeneration)};
    const deploymentId = ${JSON.stringify(deploymentId)};
    const commit = ${JSON.stringify(commit)};
    const env = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_NAME: "bagger-inv",
      VERCEL_PROJECT_ID: ${JSON.stringify(PRODUCTION_VERCEL_PROJECT_ID)},
      VERCEL_GIT_COMMIT_SHA: commit,
      VERCEL_DEPLOYMENT_ID: deploymentId,
      PRODUCTION_FOUNDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
      PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
      PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit,
      PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: ${JSON.stringify(PRODUCTION_VERCEL_PROJECT_ID)},
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
      PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
      PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF: ${JSON.stringify(PRODUCTION_SUPABASE_PROJECT_REF)},
      PRODUCTION_SUPABASE_URL: ${JSON.stringify(PRODUCTION_SUPABASE_URL)},
      PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: ${JSON.stringify(PRODUCTION_GOOGLE_WORKBOOK_ID)},
      SCORING_AUTHORITY: "google",
      PARTICIPANT_IDENTITY_AUTHORITY: "passport",
      PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: authorityGeneration,
      PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: admissionGeneration,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy-writer@example.invalid",
    };
    const request = {
      method: "POST",
      url: "https://baggerinv.com/api/scoring/current",
      headers: new Headers({
        host: "baggerinv.com",
        origin: "https://baggerinv.com",
        "x-forwarded-host": "baggerinv.com",
        "x-forwarded-proto": "https",
      }),
    };
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url).split("/").at(-1));
      const resumed = calls.length === 3;
      return Response.json({
        ok: true,
        activation_revision: 11,
        admission_revision: 8,
        authority_generation_id: authorityGeneration,
        admission_generation_id: admissionGeneration,
        deployment_id: deploymentId,
        authority: resumed ? "SUPABASE" : "GOOGLE",
        admission_state: resumed ? "CLOSED" : "CLOSING",
        execution_gate: resumed ? "OPEN" : "PAUSED",
        scoring_ingress_enabled: resumed,
        maintenance_state: resumed ? "NORMAL" : "SCORING_MAINTENANCE",
        boundary_mode: "MAINTENANCE_WINDOW_V1",
        contract_version: "ADMISSION_V3",
        provider_credential_class: "LEGACY_PROVIDER_FENCEABLE",
        provider_principal_fingerprint: ${JSON.stringify(principal)},
      });
    };
    const failures = [];
    let operationCalled = false;
    try {
      await inspectProductionScoringMutationAuthority(
        { expectedAuthority: "GOOGLE", request },
        { env, fetchImpl },
      );
    } catch (caught) {
      failures.push({
        code: caught.code,
        status: caught.status,
        maintenanceState: caught.authorityDiagnostics?.maintenanceState,
        boundaryMode: caught.authorityDiagnostics?.boundaryMode,
      });
    }
    try {
      await withProductionGoogleAuthorityWrite({
        tournamentId: "2026",
        matchId: "2026-R1-1",
        actorId: "CB01",
        operation: "PARTICIPANT:SCORE",
        operationRequestId: "33333333-3333-4333-8333-333333333333",
        request,
        scoringAuthorityContract: {
          version: "scoring-mutation-authority-v1",
          scoringAuthority: "google",
          authorityGeneration,
          admissionGeneration,
          activationRevision: 11,
          admissionRevision: 7,
          deploymentId,
          deploymentCommit: commit,
        },
      }, async () => {
        operationCalled = true;
      }, { env, fetchImpl });
    } catch (caught) {
      failures.push({
        code: caught.code,
        status: caught.status,
        maintenanceState: caught.authorityDiagnostics?.maintenanceState,
        boundaryMode: caught.authorityDiagnostics?.boundaryMode,
      });
    }
    let resumedAuthority = "";
    try {
      env.SCORING_AUTHORITY = "supabase";
      resumedAuthority = (await inspectProductionScoringMutationAuthority(
        { expectedAuthority: "SUPABASE", request },
        { env, fetchImpl },
      )).scoringAuthority;
    } catch (caught) {
      failures.push({ code: caught.code, status: caught.status });
    }
    process.stdout.write(JSON.stringify({ calls, failures, operationCalled, resumedAuthority }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  const evidence = JSON.parse(child.stdout);
  assert.deepEqual(evidence.calls, [
    "inspect_production_scoring_admission",
    "inspect_production_scoring_admission",
    "inspect_production_scoring_admission",
  ]);
  assert.deepEqual(evidence.failures, [
    {
      code: "PRODUCTION_SCORING_MAINTENANCE_ACTIVE",
      status: 503,
      maintenanceState: "SCORING_MAINTENANCE",
      boundaryMode: "MAINTENANCE_WINDOW_V1",
    },
    {
      code: "PRODUCTION_SCORING_MAINTENANCE_ACTIVE",
      status: 503,
      maintenanceState: "SCORING_MAINTENANCE",
      boundaryMode: "MAINTENANCE_WINDOW_V1",
    },
  ]);
  assert.equal(evidence.operationCalled, false);
  assert.equal(evidence.resumedAuthority, "SUPABASE");
});
