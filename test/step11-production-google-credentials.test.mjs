import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertProductionGoogleCredentialEnvironment,
  currentGoogleServiceAccountCredentials,
  googleServiceAccountCredentialDiagnostics,
  productionGoogleDrivePrincipalFingerprint,
  productionGoogleCredentialEnvironment,
  productionGoogleCredentialOperationNames,
  PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
  PRODUCTION_VERCEL_PROJECT_ID,
  withProductionGoogleServiceAccountCredentials,
} from "../lib/google-service-account-credential-context.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "../lib/production-foundation-resource-contract.js";
import {
  productionFutureGoogleWriterResources,
  resolveProductionFutureGoogleWriterContext,
} from "../lib/production-future-google-writer-server.js";

const root = process.cwd();
const legacyEmail = "preview-legacy@example.invalid";
const legacyKey = "preview-legacy-private-key";
const productionKey = "production-dedicated-private-key";

const resources = Object.freeze({
  supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
  supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
  googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
  tournamentId: PRODUCTION_TOURNAMENT_ID,
  tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
  vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
  vercelProjectName: "bagger-inv",
  canonicalHostname: "baggerinv.com",
});

const productionEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  GOOGLE_SHEETS_SPREADSHEET_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: legacyEmail,
  GOOGLE_PRIVATE_KEY: legacyKey,
  PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL:
    PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
  PRODUCTION_GOOGLE_PRIVATE_KEY: productionKey,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
  ODDS_PUBLICATION_AUTHORITY: "google",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  ROUND_SCORECARDS_ARCHIVE_ENABLED: "false",
});

const candidateHostname = "bagger-production-shadow-metadata.vercel.app";
const candidateEnv = Object.freeze({
  ...productionEnv,
  VERCEL_ENV: "preview",
  VERCEL_URL: "bagger-production-shadow-deployment.vercel.app",
  VERCEL_BRANCH_URL: candidateHostname,
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: candidateHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: "a".repeat(40),
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_SECRET_KEY: "production-server-secret-never-serialized",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-browser-publishable-key",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "production-auth-rate-limit-only-secret",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
});

// Retired behavior: Google service-account principal fingerprint helper now refuses runtime use; any retained historical import credential work is maintenance-only. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Canonical Google credential capture is retired; zero credential consumption and no callback invocation replace the runtime requirement. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


test("canonical legacy identity cannot alias the dedicated principal by email case", () => {
  const state = productionGoogleCredentialEnvironment({
    env: {
      ...productionEnv,
      VERCEL_DEPLOYMENT_ID: "dpl_12345678Test",
      PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "11111111-1111-4111-8111-111111111111",
      PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: "22222222-2222-4222-8222-222222222222",
      GOOGLE_SERVICE_ACCOUNT_EMAIL:
        PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL.toUpperCase(),
      GOOGLE_PRIVATE_KEY: "separate-key-but-same-drive-principal",
    },
    operation: "CANONICAL_LEGACY_V2",
    resources,
  });
  assert.equal(state.allowed, false);
  assert.equal(state.credentialIdentityApproved, false);
  assert.equal(state.credentialsSeparated, false);
});

// Retired behavior: Legacy application traffic choosing GOOGLE_* is removed; fresh runtime should require no provider credentials. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Read-only Google Production worker credential selection is retired along with required worker. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Legacy Google writer admission identity is retired; canonical PostgreSQL entitlement/actor authority remains required. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


test("the exact isolated candidate may certify metadata but cannot select synchronization or writer operations", () => {
  const metadata = productionGoogleCredentialEnvironment({
    env: candidateEnv,
    operation: "PRODUCTION_WORKBOOK_METADATA_READ",
    resources,
  });
  assert.equal(metadata.allowed, true);
  assert.equal(metadata.candidateMetadataReadApproved, true);
  assert.equal(metadata.policy.googleWrite, false);
  for (const operation of ["SCORING_GOOGLE_OUTBOX", "ODDS_GOOGLE_MIRROR"]) {
    const state = productionGoogleCredentialEnvironment({ env: candidateEnv, operation, resources });
    assert.equal(state.allowed, false, operation);
    assert.equal(state.candidateMetadataReadApproved, false, operation);
    assert.equal(state.reason, "production-environment-required", operation);
  }
  const retiredGuide = productionGoogleCredentialEnvironment({
    env: candidateEnv,
    operation: "GUIDE_SYNCHRONIZATION",
    resources,
  });
  assert.equal(retiredGuide.allowed, false);
  assert.equal(retiredGuide.reason, "production-google-operation-not-allowed");
});

test("candidate metadata certification still rejects Preview or inexact workbook resources", () => {
  const previewWorkbook = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
  assert.equal(productionGoogleCredentialEnvironment({
    env: { ...candidateEnv, GOOGLE_SHEETS_ID: previewWorkbook },
    operation: "PRODUCTION_WORKBOOK_METADATA_READ",
    resources,
  }).allowed, false);
  const state = productionGoogleCredentialEnvironment({
    env: candidateEnv,
    operation: "PRODUCTION_WORKBOOK_METADATA_READ",
    resources: { ...resources, googleWorkbookId: previewWorkbook },
  });
  assert.equal(state.allowed, false);
  assert.equal(state.reason, "exact-production-resource-request-required");
});

// Retired behavior: Google worker credential fallback test catches global retired error instead of old credential-specific error; preserve no credential/provider use under every config. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


test("the Preview/legacy identity cannot masquerade as the Production worker identity", () => {
  for (const env of [
    {
      ...productionEnv,
      PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: legacyEmail,
    },
    {
      ...productionEnv,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
    },
    {
      ...productionEnv,
      GOOGLE_PRIVATE_KEY: productionKey,
    },
  ]) {
    const state = productionGoogleCredentialEnvironment({
      env,
      operation: "NET_SKINS_SYNCHRONIZATION",
      resources,
    });
    assert.equal(state.allowed, false);
    assert.match(state.reason, /dedicated-production-google-identity|required|separation/);
  }
});

test("Production selection rejects every Preview or inexact resource boundary", () => {
  const cases = [
    [{ ...productionEnv, VERCEL_ENV: "preview" }, resources, "production-environment-required"],
    [{ ...productionEnv, VERCEL_PROJECT_ID: "prj_preview" }, resources, "production-vercel-project-required"],
    [{ ...productionEnv, PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" }, resources, "production-supabase-project-required"],
    [{ ...productionEnv, PRODUCTION_SUPABASE_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" }, resources, "production-supabase-project-required"],
    [{ ...productionEnv, SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" }, resources, "production-runtime-supabase-required"],
    [{ ...productionEnv, GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" }, resources, "production-workbook-required"],
    [productionEnv, { ...resources, googleWorkbookId: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" }, "exact-production-resource-request-required"],
    [productionEnv, { ...resources, supabaseProjectRef: "idgigvjjqkfbqjeredpb" }, "exact-production-resource-request-required"],
    [productionEnv, { ...resources, tournamentId: "2025", tournamentYear: 2025 }, "exact-production-resource-request-required"],
    [productionEnv, { ...resources, canonicalHostname: "preview.vercel.app" }, "exact-production-resource-request-required"],
  ];
  for (const [env, requested, reason] of cases) {
    const state = productionGoogleCredentialEnvironment({
      env,
      operation: "NET_SKINS_SYNCHRONIZATION",
      resources: requested,
    });
    assert.equal(state.allowed, false, reason);
    assert.equal(state.reason, reason);
  }
});

test("Google-writing identities remain unavailable until authority and explicit worker gates are active", () => {
  for (const operation of [
    "SCORING_GOOGLE_OUTBOX",
    "ROUND_SCORECARDS_ARCHIVE",
    "ODDS_GOOGLE_MIRROR",
  ]) {
    const state = productionGoogleCredentialEnvironment({ env: productionEnv, operation, resources });
    assert.equal(state.allowed, false);
    assert.match(state.reason, /operation-authority-not-ready|production-google-write-activation-required/);
    assert.equal(state.safety.automaticGoogleWriteActivation, false);
    assert.equal(state.safety.automaticAuthorityChange, false);
  }

  const scoringReady = {
    ...productionEnv,
    SCORING_AUTHORITY: "supabase",
    PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true",
    ROUND_SCORECARDS_ARCHIVE_ENABLED: "true",
  };
  assert.equal(productionGoogleCredentialEnvironment({
    env: scoringReady,
    operation: "SCORING_GOOGLE_OUTBOX",
    resources,
  }).allowed, true);
  assert.equal(productionGoogleCredentialEnvironment({
    env: scoringReady,
    operation: "ROUND_SCORECARDS_ARCHIVE",
    resources,
  }).allowed, true);

  const oddsReady = {
    ...productionEnv,
    ODDS_PUBLICATION_AUTHORITY: "supabase",
    PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true",
    PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
    PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "true",
  };
  assert.equal(productionGoogleCredentialEnvironment({
    env: oddsReady,
    operation: "ODDS_GOOGLE_MIRROR",
    resources,
  }).allowed, true);
  assert.equal(productionGoogleCredentialEnvironment({
    env: {
      ...oddsReady,
      PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
    },
    operation: "ODDS_GOOGLE_MIRROR",
    resources,
  }).allowed, false);
});

test("future Match compatibility credentials require the branded annual writer context", async () => {
  const scoringReady = {
    ...productionEnv,
    SCORING_AUTHORITY: "supabase",
    PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true",
  };
  const unbranded = productionGoogleCredentialEnvironment({
    env: scoringReady,
    operation: "FUTURE_MATCH_GOOGLE_COMPATIBILITY",
    resources,
  });
  assert.equal(unbranded.allowed, false);
  assert.equal(unbranded.requestedResources.tournamentId, false);
  assert.equal(unbranded.requestedResources.tournamentYear, false);

  const writerContext = await resolveProductionFutureGoogleWriterContext({
    targetTournamentId: "2099",
    rpc: async () => ({
      payload: {
        ok: true,
        contractVersion: "production-future-google-match-provisioning-v2",
        targetTournamentId: "2099",
        writerGenerationId: "10000000-0000-4000-8000-000000000099",
        destinationWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
        targetContractFingerprint: "a".repeat(64),
        implementationFingerprint: "b".repeat(64),
        nonAuthoritative: true,
        rollbackAllowed: false,
      },
    }),
  });
  const branded = productionGoogleCredentialEnvironment({
    env: scoringReady,
    operation: "FUTURE_MATCH_GOOGLE_COMPATIBILITY",
    resources: productionFutureGoogleWriterResources(writerContext),
  });
  assert.equal(branded.allowed, true);
  assert.equal(branded.requestedResources.tournamentId, true);
  assert.equal(branded.requestedResources.tournamentYear, true);
});

test("the allowlist contains synchronization, mirror, archive, and metadata only", () => {
  const operations = productionGoogleCredentialOperationNames();
  for (const required of [
    "PRODUCTION_WORKBOOK_METADATA_READ",
    "CANONICAL_LEGACY_V2",
    "SCORING_GOOGLE_OUTBOX",
    "ROUND_SCORECARDS_ARCHIVE",
    "ODDS_GOOGLE_MIRROR",
  ]) assert.equal(operations.includes(required), true);
  for (const forbidden of [
    "DIRECT_GOOGLE_SCORING",
    "DIRECTOR_CANONICAL_WRITE",
    "PASSPORT_MUTATION",
    "ODDS_PUBLICATION",
    "PREVIEW_RESET",
    "PREDICTION_SETTINGS_SYNCHRONIZATION",
    "DRAFT_SYNCHRONIZATION",
    "GUIDE_SYNCHRONIZATION",
  ]) assert.equal(operations.includes(forbidden), false);
  assert.throws(
    () => assertProductionGoogleCredentialEnvironment({
      env: productionEnv,
      operation: "DIRECT_GOOGLE_SCORING",
      resources,
    }),
    (error) => error.code === "PRODUCTION_GOOGLE_CREDENTIAL_UNAVAILABLE" &&
      error.diagnostics.reason === "production-google-operation-not-allowed",
  );
});

test("diagnostics, errors, and JSON serialization contain no credential material", () => {
  const state = productionGoogleCredentialEnvironment({
    env: productionEnv,
    operation: "PRODUCTION_WORKBOOK_METADATA_READ",
    resources,
  });
  const serialized = JSON.stringify(state);
  assert.doesNotMatch(serialized, /production-dedicated-private-key|preview-legacy-private-key/);
  assert.doesNotMatch(serialized, /sbi-production-workbook@|preview-legacy@/);
  try {
    assertProductionGoogleCredentialEnvironment({
      env: { ...productionEnv, VERCEL_ENV: "preview" },
      operation: "PRODUCTION_WORKBOOK_METADATA_READ",
      resources,
    });
    assert.fail("Expected the Production credential assertion to fail.");
  } catch (error) {
    const failure = JSON.stringify({ message: error.message, diagnostics: error.diagnostics });
    assert.doesNotMatch(failure, /production-dedicated-private-key|preview-legacy-private-key/);
    assert.doesNotMatch(failure, /sbi-production-workbook@|preview-legacy@/);
  }
});

test("Production credential facade is server-only and absent from Client Components", async () => {
  const serverFacade = await readFile(
    path.join(root, "lib/production-google-service-account-server.js"),
    "utf8",
  );
  const contextSource = await readFile(
    path.join(root, "lib/google-service-account-credential-context.js"),
    "utf8",
  );
  const reader = await readFile(path.join(root, "lib/google-sheets-server-read.js"), "utf8");
  const writer = await readFile(path.join(root, "lib/google-sheets-write.js"), "utf8");
  assert.match(serverFacade, /^import "server-only";/);
  assert.match(contextSource, /AsyncLocalStorage/);
  assert.match(reader, /currentGoogleServiceAccountCredentials/);
  assert.match(writer, /currentGoogleServiceAccountCredentials/);
  assert.match(writer, /\["production-worker", "legacy-canonical"\]\.includes/);
  assert.match(writer, /credential\?\.resources\?\.googleWorkbookId/);
  assert.match(writer, /scopedProductionWorkbook \|\| resolveSpreadsheetId\(\)/);
  assert.match(reader, /cachedAccessTokens = new Map/);
  assert.match(writer, /cachedGoogleTokens = new Map/);

  const clientFiles = (await Promise.all(
    ["app"].map(async (directory) => {
      const { execFile } = await import("node:child_process");
      return await new Promise((resolve, reject) => execFile(
        "rg",
        ["-l", "^[\\\"']use client[\\\"']", directory, "--glob", "*.js", "--glob", "*.jsx"],
        { cwd: root },
        (error, stdout) => error && error.code !== 1 ? reject(error) : resolve(stdout.trim().split("\n").filter(Boolean)),
      ));
    }),
  )).flat();
  for (const file of clientFiles) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /production-google-service-account|google-service-account-credential-context|PRODUCTION_GOOGLE_PRIVATE_KEY/);
  }
});

// Retired behavior: Google metadata provider-reading route is terminal retired rather than Director candidate diagnostic; retain secret-free response and no Google/network access. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Google certificate alias is now separately terminal retired rather than re-exporting provider metadata handler; no consumer can obtain runtime Google certificate. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.
