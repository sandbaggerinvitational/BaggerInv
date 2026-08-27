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

test("legacy Drive principal fingerprint is normalized and survives key rotation", async () => {
  const expected = createHash("sha256")
    .update(`google-drive-permission-principal-v1\nuser\n${legacyEmail}`)
    .digest("hex");
  assert.equal(productionGoogleDrivePrincipalFingerprint(`  ${legacyEmail.toUpperCase()}  `), expected);
  assert.equal(productionGoogleDrivePrincipalFingerprint("not-an-email"), "");

  const canonicalBase = {
    ...productionEnv,
    VERCEL_DEPLOYMENT_ID: "dpl_12345678Test",
    PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "11111111-1111-4111-8111-111111111111",
    PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: "22222222-2222-4222-8222-222222222222",
  };
  const admission = Object.freeze({
    admissionId: "33333333-3333-4333-8333-333333333333",
    providerCredentialClass: "LEGACY_PROVIDER_FENCEABLE",
    providerPrincipalFingerprint: expected,
  });
  const selectedKeys = [];
  const selectedCacheKeys = [];
  for (const privateKey of ["legacy-key-generation-a", "legacy-key-generation-b"]) {
    const env = { ...canonicalBase, GOOGLE_PRIVATE_KEY: privateKey };
    const state = productionGoogleCredentialEnvironment({
      env,
      operation: "CANONICAL_LEGACY_V2",
      resources,
    });
    assert.equal(state.providerPrincipalFingerprint, expected);
    await withProductionGoogleServiceAccountCredentials({
      env,
      operation: "CANONICAL_LEGACY_V2",
      resources,
      canonicalAdmission: admission,
    }, async () => {
      const selected = currentGoogleServiceAccountCredentials(env);
      selectedKeys.push(selected.privateKey);
      selectedCacheKeys.push(selected.cacheKey);
    });
  }
  assert.deepEqual(selectedKeys, ["legacy-key-generation-a", "legacy-key-generation-b"]);
  assert.equal(selectedCacheKeys[0], selectedCacheKeys[1]);

  const otherEmail = "other-legacy-writer@example.invalid";
  const otherFingerprint = productionGoogleDrivePrincipalFingerprint(otherEmail);
  let otherCacheKey = "";
  await withProductionGoogleServiceAccountCredentials({
    env: { ...canonicalBase, GOOGLE_SERVICE_ACCOUNT_EMAIL: otherEmail },
    operation: "CANONICAL_LEGACY_V2",
    resources,
    canonicalAdmission: Object.freeze({
      admissionId: "44444444-4444-4444-8444-444444444444",
      providerCredentialClass: "LEGACY_PROVIDER_FENCEABLE",
      providerPrincipalFingerprint: otherFingerprint,
    }),
  }, async () => {
    otherCacheKey = currentGoogleServiceAccountCredentials().cacheKey;
  });
  assert.notEqual(otherCacheKey, selectedCacheKeys[0]);
});

test("validated canonical credential pair is captured once before callback dispatch", async () => {
  const canonicalBase = {
    ...productionEnv,
    VERCEL_DEPLOYMENT_ID: "dpl_12345678Test",
    PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "11111111-1111-4111-8111-111111111111",
    PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: "22222222-2222-4222-8222-222222222222",
  };
  let emailReads = 0;
  let keyReads = 0;
  const env = new Proxy(canonicalBase, {
    get(target, property, receiver) {
      if (property === "GOOGLE_SERVICE_ACCOUNT_EMAIL") {
        emailReads += 1;
        return emailReads === 1 ? legacyEmail : "substituted@example.invalid";
      }
      if (property === "GOOGLE_PRIVATE_KEY") {
        keyReads += 1;
        return keyReads === 1 ? legacyKey : "substituted-private-key";
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const admission = Object.freeze({
    admissionId: "33333333-3333-4333-8333-333333333333",
    providerCredentialClass: "LEGACY_PROVIDER_FENCEABLE",
    providerPrincipalFingerprint: productionGoogleDrivePrincipalFingerprint(legacyEmail),
  });
  let selected;
  await withProductionGoogleServiceAccountCredentials({
    env,
    operation: "CANONICAL_LEGACY_V2",
    resources,
    canonicalAdmission: admission,
  }, async () => {
    selected = currentGoogleServiceAccountCredentials(env);
  });
  assert.equal(emailReads, 1);
  assert.equal(keyReads, 1);
  assert.equal(selected.email, legacyEmail);
  assert.equal(selected.privateKey, legacyKey);
});

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

test("legacy application traffic remains on GOOGLE_* even when Production credentials exist", () => {
  const selected = currentGoogleServiceAccountCredentials(productionEnv);
  assert.equal(selected.source, "legacy");
  assert.equal(selected.email, legacyEmail);
  assert.equal(selected.privateKey, legacyKey);
  assert.equal(selected.cacheKey, `legacy:${productionGoogleDrivePrincipalFingerprint(legacyEmail)}`);
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
    assert.equal(selected.cacheKey,
      `production-worker:${productionGoogleDrivePrincipalFingerprint(PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL)}`);
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

test("an exact canonical admission scope selects only the legacy writer identity", async () => {
  const canonicalEnv = {
    ...productionEnv,
    VERCEL_DEPLOYMENT_ID: "dpl_12345678Test",
    PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "11111111-1111-4111-8111-111111111111",
    PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: "22222222-2222-4222-8222-222222222222",
  };
  const admission = Object.freeze({ admissionId: "33333333-3333-4333-8333-333333333333",
    providerCredentialClass: "LEGACY_PROVIDER_FENCEABLE",
    providerPrincipalFingerprint: productionGoogleDrivePrincipalFingerprint(legacyEmail) });
  const state = productionGoogleCredentialEnvironment({
    env: canonicalEnv,
    operation: "CANONICAL_LEGACY_V2",
    resources,
  });
  assert.equal(state.allowed, true);
  assert.equal(state.credentialSource, "legacy-canonical");
  assert.equal(state.safety.canonicalLegacyUsesLegacyIdentity, true);
  await withProductionGoogleServiceAccountCredentials({
    env: canonicalEnv,
    operation: "CANONICAL_LEGACY_V2",
    resources,
    canonicalAdmission: admission,
  }, async () => {
    const selected = currentGoogleServiceAccountCredentials(canonicalEnv);
    assert.equal(selected.source, "legacy-canonical");
    assert.equal(selected.email, legacyEmail);
    assert.equal(selected.privateKey, legacyKey);
    assert.notEqual(selected.email, PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL);
    assert.equal(googleServiceAccountCredentialDiagnostics(canonicalEnv).operation,
      "CANONICAL_LEGACY_V2");
  });
});

test("the exact isolated candidate may certify metadata but cannot select synchronization or writer operations", () => {
  const metadata = productionGoogleCredentialEnvironment({
    env: candidateEnv,
    operation: "PRODUCTION_WORKBOOK_METADATA_READ",
    resources,
  });
  assert.equal(metadata.allowed, true);
  assert.equal(metadata.candidateMetadataReadApproved, true);
  assert.equal(metadata.policy.googleWrite, false);
  for (const operation of ["GUIDE_SYNCHRONIZATION", "SCORING_GOOGLE_OUTBOX", "ODDS_GOOGLE_MIRROR"]) {
    const state = productionGoogleCredentialEnvironment({ env: candidateEnv, operation, resources });
    assert.equal(state.allowed, false, operation);
    assert.equal(state.candidateMetadataReadApproved, false, operation);
    assert.equal(state.reason, "production-environment-required", operation);
  }
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
    "CANONICAL_LEGACY_V2",
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

test("Step 11 metadata route is Director-only, exact-candidate, read-only, and secret-safe", async () => {
  const route = await readFile(path.join(root,
    "app/api/admin/step11-production-google-metadata/route.js"), "utf8");
  const writer = await readFile(path.join(root, "lib/google-sheets-write.js"), "utf8");
  const directorAuthorization = await readFile(path.join(root,
    "lib/preview-director-authorization.js"), "utf8");
  assert.match(route, /assertProductionShadowCandidateRequest/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /allowBootstrap:\s*false/);
  assert.match(route, /PRODUCTION_WORKBOOK_METADATA_READ/);
  assert.match(route, /readWorkbookNativeMetadataSnapshot/);
  assert.match(route, /writerOperations/);
  assert.match(route, /PRODUCTION_GOOGLE_WORKBOOK_ACCESS_DENIED/);
  assert.match(route, /PRODUCTION_GOOGLE_AUTHENTICATION_FAILED/);
  assert.match(route, /error\?\.workbookDiagnostics/);
  assert.match(route, /previewWorkbookSelectable:\s*false/);
  assert.doesNotMatch(route, /PRODUCTION_GOOGLE_PRIVATE_KEY|GOOGLE_PRIVATE_KEY|accessToken/);
  assert.doesNotMatch(route, /method:\s*["']POST|batchUpdate|values:batchUpdate/);
  assert.match(directorAuthorization, /["']\/api\/admin\/step11-production-google-metadata["']/);
  assert.match(directorAuthorization, /["']\/api\/admin\/step11-production-google-certificate["']/);
  assert.match(writer, /readWorkbookNativeMetadataSnapshot/);
  assert.doesNotMatch(writer.match(/export async function readWorkbookNativeMetadataSnapshot\(\)[\s\S]*?\n}\n/)?.[0] || "",
    /editors|users|groups|domainUsersCanEdit|rowData|values/);
});

test("Step 11 browser certificate alias reuses the exact metadata handler", async () => {
  const alias = await readFile(path.join(root,
    "app/api/admin/step11-production-google-certificate/route.js"), "utf8");
  assert.match(alias, /from "\.\.\/step11-production-google-metadata\/route\.js"/);
  assert.match(alias, /\bGET\b/);
  assert.doesNotMatch(alias, /(?:POST|PUT|PATCH|DELETE)/);
});
