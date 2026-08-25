import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertProductionGoogleCredentialEnvironment,
  currentGoogleServiceAccountCredentials,
  googleServiceAccountCredentialDiagnostics,
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

test("legacy application traffic remains on GOOGLE_* even when Production credentials exist", () => {
  const selected = currentGoogleServiceAccountCredentials(productionEnv);
  assert.equal(selected.source, "legacy");
  assert.equal(selected.email, legacyEmail);
  assert.equal(selected.privateKey, legacyKey);
  assert.equal(selected.cacheKey, "legacy");
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), {
    source: "legacy",
    diagnostics: {
      credentialSource: "legacy",
      configured: true,
      productionWorkerContext: false,
    },
  });
});

test("an exact read-only Production worker context selects only the dedicated pair", async () => {
  const before = currentGoogleServiceAccountCredentials(productionEnv);
  const result = await withProductionGoogleServiceAccountCredentials({
    env: productionEnv,
    operation: "PRODUCTION_WORKBOOK_METADATA_READ",
    resources,
  }, async () => {
    const selected = currentGoogleServiceAccountCredentials(productionEnv);
    assert.equal(selected.source, "production-worker");
    assert.equal(selected.email, PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL);
    assert.equal(selected.privateKey, productionKey);
    assert.equal(selected.cacheKey, "production-worker");
    assert.equal(JSON.stringify(selected).includes(productionKey), false);
    assert.equal(JSON.stringify(selected).includes(PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL), false);
    const diagnostics = googleServiceAccountCredentialDiagnostics(productionEnv);
    assert.equal(diagnostics.allowed, true);
    assert.equal(diagnostics.operation, "PRODUCTION_WORKBOOK_METADATA_READ");
    return "selected";
  });
  assert.equal(result, "selected");
  const after = currentGoogleServiceAccountCredentials(productionEnv);
  assert.equal(after.source, before.source);
  assert.equal(after.email, before.email);
  assert.equal(after.privateKey, before.privateKey);
});

test("Production worker selection never falls back to legacy credentials", () => {
  const missing = {
    ...productionEnv,
    PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
    PRODUCTION_GOOGLE_PRIVATE_KEY: "",
  };
  assert.throws(
    () => withProductionGoogleServiceAccountCredentials({
      env: missing,
      operation: "PRODUCTION_WORKBOOK_METADATA_READ",
      resources,
    }, () => currentGoogleServiceAccountCredentials(missing)),
    (error) => error.code === "PRODUCTION_GOOGLE_CREDENTIAL_UNAVAILABLE" &&
      error.diagnostics.reason === "production-google-credentials-required",
  );
});

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
      operation: "PRODUCTION_WORKBOOK_METADATA_READ",
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
      operation: "GUIDE_SYNCHRONIZATION",
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
  };
  assert.equal(productionGoogleCredentialEnvironment({
    env: oddsReady,
    operation: "ODDS_GOOGLE_MIRROR",
    resources,
  }).allowed, true);
});

test("the allowlist contains synchronization, mirror, archive, and metadata only", () => {
  const operations = productionGoogleCredentialOperationNames();
  for (const required of [
    "PRODUCTION_WORKBOOK_METADATA_READ",
    "GUIDE_SYNCHRONIZATION",
    "PREDICTION_SETTINGS_SYNCHRONIZATION",
    "DRAFT_SYNCHRONIZATION",
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
