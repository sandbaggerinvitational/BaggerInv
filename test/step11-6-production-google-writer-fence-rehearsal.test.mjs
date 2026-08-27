import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from
  "../lib/google-service-account-credential-context.js";

const childMode = process.env.STEP11_6_DRIVE_ACL_REHEARSAL_TEST === "1";

if (!childMode) {
  test("retired Sheets rehearsal and Drive ACL/WAF executor surface are exact", () => {
    const child = spawnSync(process.execPath, [process.argv[1]], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        STEP11_6_DRIVE_ACL_REHEARSAL_TEST: "1",
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
          .filter(Boolean).join(" "),
      },
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
  });
} else {
const {
  executeProductionGoogleWriterFenceRehearsal,
  executeProductionGoogleWriterProviderFence,
  productionGoogleWriterFenceRehearsalEnvironment,
  productionGoogleWriterProviderFenceEnvironment,
  publicProductionGoogleWriterFenceError,
  PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
  PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_CONFIRMATION,
} = await import("../lib/production-google-writer-fence-rehearsal.js");

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => readFile(path.join(root, relative), "utf8");
const commitSha = "7".repeat(40);
const candidateHostname =
  "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app";
const dedicatedEmail =
  "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com";
const legacyEmail =
  "legacy-writer@sandbagger-invitational.iam.gserviceaccount.com";
const operationRequestId = "11111111-1111-4111-8111-111111111111";
const quiesceEvidenceId = "22222222-2222-4222-8222-222222222222";
const criticalWafEpochId = "33333333-3333-4333-8333-333333333333";

function privateKey() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  });
}

const legacyPrivateKey = privateKey();
const dedicatedPrivateKey = privateKey();

function rehearsalEnvironment(overrides = {}) {
  return {
    VERCEL_ENV: "preview",
    VERCEL_URL: "bagger-inv-unique-sandbagger-invitational.vercel.app",
    VERCEL_BRANCH_URL: candidateHostname,
    VERCEL_GIT_COMMIT_SHA: commitSha,
    VERCEL_GIT_COMMIT_REF: PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
    VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
    VERCEL_PROJECT_NAME: "bagger-inv",
    PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
    PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: candidateHostname,
    PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: commitSha,
    PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID:
      PRODUCTION_VERCEL_PROJECT_ID,
    PRODUCTION_FOUNDATION_ENABLED: "true",
    PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_URL,
    PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"s".repeat(40)}`,
    GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
    NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:
      `sb_publishable_${"p".repeat(32)}`,
    PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
    SCORING_AUTHORITY: "google",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
    PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
    PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
    NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY:
      "turnstile-public-test-key",
    PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "r".repeat(40),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: legacyEmail,
    GOOGLE_PRIVATE_KEY: legacyPrivateKey,
    PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: dedicatedEmail,
    PRODUCTION_GOOGLE_PRIVATE_KEY: dedicatedPrivateKey,
    PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED: "true",
    PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA: commitSha,
    ...overrides,
  };
}

function persistentEnvironment(overrides = {}) {
  return rehearsalEnvironment({
    VERCEL_DEPLOYMENT_ID: "dpl_PersistentFenceCandidate1",
    PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
    PRODUCTION_CUTOVER_PHASE: "CURRENT_READS",
    PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
    PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
    PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
    PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
    PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
    PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
    PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
    PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED: "false",
    PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENABLED: "true",
    PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_EXPECTED_COMMIT_SHA: commitSha,
    ...overrides,
  });
}

function exactInput(action, extra = {}) {
  return {
    action,
    operationRequestId,
    expectedCommitSha: commitSha,
    expectedWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    expectedBranch: PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
    expectedDirectorPlayerId: "CB01",
    installRequestId: "",
    fenceId: "",
    quiesceEvidenceId,
    criticalWafEpochId,
    expectedBaselineFingerprint: "",
    expectedCanonicalValueFingerprint: "",
    confirmation: action === "install"
      ? "STEP12_GOOGLE_WRITER_PROVIDER_FENCE"
      : action === "abort-install"
        ? PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_CONFIRMATION : "",
    quiescePurpose: "REHEARSAL",
    ...extra,
  };
}

function fakeDriveProvider() {
  const calls = [];
  const response = (payload, status = 200) => new Response(
    JSON.stringify(payload),
    { status, headers: { "content-type": "application/json" } },
  );
  const permissions = [
    { id: "owner-permission-secret", type: "user", role: "owner",
      emailAddress: "owner@example.test" },
    { id: "dedicated-permission-secret", type: "user", role: "writer",
      emailAddress: dedicatedEmail },
    { id: "legacy-permission-secret", type: "user", role: "writer",
      emailAddress: legacyEmail },
    { id: "reader-permission-secret", type: "anyone", role: "reader",
      allowFileDiscovery: false },
  ];
  const fetchImpl = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    const method = String(options.method || "GET").toUpperCase();
    calls.push({ url: String(rawUrl), method, signal: options.signal });
    if (String(rawUrl) === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(options.body).get("assertion");
      const claims = JSON.parse(Buffer.from(
        assertion.split(".")[1], "base64url",
      ).toString("utf8"));
      return response({
        access_token: claims.iss === dedicatedEmail
          ? "dedicated-read-token-123456789"
          : "legacy-read-token-123456789",
      });
    }
    const token = String(options.headers?.authorization || "")
      .replace(/^Bearer /, "");
    const legacy = token.startsWith("legacy-");
    if (url.pathname.endsWith("/about")) {
      return response({ user: legacy
        ? { me: true, emailAddress: legacyEmail,
          permissionId: "legacy-permission-secret" }
        : { me: true, emailAddress: dedicatedEmail,
          permissionId: "dedicated-permission-secret" } });
    }
    if (url.pathname.endsWith("/permissions")) {
      assert.equal(legacy, false);
      return response({ permissions });
    }
    if (url.pathname.includes(`/files/${PRODUCTION_GOOGLE_WORKBOOK_ID}`)) {
      if (legacy) {
        return response({
          id: PRODUCTION_GOOGLE_WORKBOOK_ID,
          mimeType: "application/vnd.google-apps.spreadsheet",
          capabilities: { canEdit: true, canShare: true },
        });
      }
      return response({
        id: PRODUCTION_GOOGLE_WORKBOOK_ID,
        mimeType: "application/vnd.google-apps.spreadsheet",
        writersCanShare: true,
        capabilities: { canShare: true },
      });
    }
    throw new Error(`Unexpected Drive test request: ${method} ${rawUrl}`);
  };
  return { calls, fetchImpl };
}

test("candidate and persistent Drive ACL environments retain exact fail-closed gates", () => {
  const rehearsal = productionGoogleWriterFenceRehearsalEnvironment(
    rehearsalEnvironment(),
  );
  assert.equal(rehearsal.allowed, true);
  assert.equal(rehearsal.safety.driveAclMutationOnly, true);
  assert.equal(rehearsal.safety.controlPlaneCriticalWafRequired, true);
  assert.equal(rehearsal.safety.protectedRangeRehearsalRetired, true);
  assert.equal(rehearsal.safety.canonicalDataFingerprintCaptured, false);
  assert.equal(rehearsal.safety.noSheetsTransportSentinelOnly, true);
  assert.equal(rehearsal.safety.providerValueWriteAttempted, false);
  assert.equal(rehearsal.credentials.separated, true);
  assert.equal(productionGoogleWriterFenceRehearsalEnvironment(
    rehearsalEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
  ).allowed, false);
  assert.equal(productionGoogleWriterFenceRehearsalEnvironment(
    rehearsalEnvironment({ PRODUCTION_GOOGLE_PRIVATE_KEY: legacyPrivateKey }),
  ).allowed, false);

  const persistent = productionGoogleWriterProviderFenceEnvironment(
    persistentEnvironment(),
  );
  assert.equal(persistent.allowed, true);
  assert.equal(persistent.safety.driveAclMutationOnly, true);
  assert.equal(persistent.safety.persistentUntilAuthorizedRemoval, true);
  assert.equal(persistent.safety.controlPlaneCriticalWafRequired, true);
  assert.equal(persistent.safety.candidateOnly, true);
  assert.equal(persistent.safety.candidateControlRuntime, true);
  assert.equal(persistent.resources.candidateDeploymentTarget, "PREVIEW");
  assert.equal(persistent.activation.safety.liveApplicationAuthority, false);
  assert.equal(productionGoogleWriterProviderFenceEnvironment(
    persistentEnvironment({ VERCEL_ENV: "production" }),
  ).allowed, false);
});

test("every persistent route action reaches CUTOVER execution from only the exact Preview candidate", async () => {
  for (const action of [
    "inspect", "install", "abort-install", "refresh", "remove",
  ]) {
    let providerCalls = 0;
    await assert.rejects(
      () => executeProductionGoogleWriterProviderFence({
        ...exactInput(action),
        quiescePurpose: "CUTOVER",
        operationRequestId: "invalid-before-provider",
      }, {
        env: persistentEnvironment(),
        fetchImpl: async () => {
          providerCalls += 1;
          throw new Error("candidate scope validation must precede provider access");
        },
      }),
      { code: "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REQUEST_SCOPE_INVALID" },
      action,
    );
    assert.equal(providerCalls, 0, action);
  }
  await assert.rejects(
    () => executeProductionGoogleWriterProviderFence({
      ...exactInput("inspect"),
      quiescePurpose: "CUTOVER",
    }, {
      env: persistentEnvironment({ VERCEL_ENV: "production" }),
      fetchImpl: async () => {
        throw new Error("a Production runtime must fail before provider access");
      },
    }),
    { code: "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENVIRONMENT_UNAVAILABLE" },
  );
});

test("retired protected-range executor is an unconditional 410 with zero dependency access", async () => {
  let touched = 0;
  const options = {};
  Object.defineProperty(options, "fetchImpl", {
    enumerable: true,
    get() { touched += 1; return async () => { touched += 1; }; },
  });
  const input = new Proxy({}, {
    get() { touched += 1; throw new Error("retired input was touched"); },
  });
  await assert.rejects(
    () => executeProductionGoogleWriterFenceRehearsal(input, options),
    { code: "STEP11_6_PROTECTED_RANGE_REHEARSAL_RETIRED", status: 410 },
  );
  assert.equal(touched, 0);
});

test("Drive ACL inspect is read-only, redacted, and reports a typed no-Sheets sentinel", async () => {
  const provider = fakeDriveProvider();
  const result = await executeProductionGoogleWriterProviderFence(
    exactInput("inspect"),
    { env: rehearsalEnvironment(), fetchImpl: provider.fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.inspection.fenceKind, "DRIVE_ACL");
  assert.equal(result.inspection.protectedRangeRehearsalRetired, true);
  assert.equal(result.inspection.canonicalDataFingerprintCaptured, false);
  assert.equal(result.inspection.noSheetsTransportSentinelKind,
    "NO_SHEETS_TRANSPORT_V1");
  assert.match(result.inspection.noSheetsTransportSentinelFingerprint,
    /^[0-9a-f]{64}$/);
  assert.equal("canonicalValueFingerprint" in result.inspection, false);
  assert.equal(result.applicationDataWriteIssued, false);
  assert.equal(result.applicationDataChanged, false);
  assert.equal(result.protectedRangeMutationCount, 0);
  assert.equal(provider.calls.some(({ method }) => method !== "GET" &&
    method !== "POST"), false);
  assert.equal(provider.calls.some(({ url }) => url.includes("sheets.googleapis.com")),
    false);
  for (const tokenCall of provider.calls.filter(({ url }) =>
    url === "https://oauth2.googleapis.com/token")) {
    assert.ok(tokenCall.signal instanceof AbortSignal);
  }
  const serialized = JSON.stringify(result);
  for (const secret of [
    legacyEmail,
    dedicatedEmail,
    "owner@example.test",
    "owner-permission-secret",
    "dedicated-permission-secret",
    "legacy-permission-secret",
  ]) assert.doesNotMatch(serialized, new RegExp(secret.replaceAll(".", "\\.")));
});

test("missing or malformed critical WAF epoch fails before control or provider access", async () => {
  for (const epochId of ["", "not-a-uuid"]) {
    let providerCalls = 0;
    let controlCalls = 0;
    await assert.rejects(
      () => executeProductionGoogleWriterProviderFence(
        exactInput("install", {
          criticalWafEpochId: epochId,
          expectedBaselineFingerprint: "a".repeat(64),
          expectedCanonicalValueFingerprint: "b".repeat(64),
        }),
        {
          env: rehearsalEnvironment(),
          fetchImpl: async () => { providerCalls += 1; },
          control: new Proxy({}, {
            get() { controlCalls += 1; return undefined; },
          }),
        },
      ),
      { code: "STEP12_GOOGLE_DRIVE_ACL_INSTALL_EVIDENCE_REQUIRED" },
    );
    assert.equal(providerCalls, 0);
    assert.equal(controlCalls, 0);
  }
});

test("stale and mismatched critical WAF epochs are propagated fail-closed before ACL PATCH", async () => {
  const inspectionProvider = fakeDriveProvider();
  const inspected = await executeProductionGoogleWriterProviderFence(
    exactInput("inspect"),
    { env: rehearsalEnvironment(), fetchImpl: inspectionProvider.fetchImpl },
  );
  const baseline = inspected.inspection.baselineMetadataFingerprint;
  const sentinel = inspected.inspection.noSheetsTransportSentinelFingerprint;
  for (const code of [
    "STEP11_6_VERCEL_WAF_EPOCH_STALE",
    "STEP11_6_VERCEL_WAF_EPOCH_SCOPE_MISMATCH",
  ]) {
    const provider = fakeDriveProvider();
    let dispatchCalls = 0;
    const control = {
      discoverInstall: async () => ({ found: false }),
      beginInstall: async ({ criticalWafEpochId: actual, lifecycleMode }) => {
        assert.equal(actual, criticalWafEpochId);
        assert.equal(lifecycleMode, "REHEARSAL");
        throw Object.assign(new Error("synthetic WAF epoch rejection"), {
          code,
          status: 409,
        });
      },
      beginInstallDispatch: async () => { dispatchCalls += 1; },
      inspect: async () => { dispatchCalls += 1; },
      recordSettlement: async () => { dispatchCalls += 1; },
      finishInstall: async () => { dispatchCalls += 1; },
    };
    await assert.rejects(
      () => executeProductionGoogleWriterProviderFence(
        exactInput("install", {
          expectedBaselineFingerprint: baseline,
          expectedCanonicalValueFingerprint: sentinel,
        }),
        { env: rehearsalEnvironment(), fetchImpl: provider.fetchImpl, control },
      ),
      { code },
    );
    assert.equal(dispatchCalls, 0);
    assert.equal(provider.calls.some(({ method }) => method === "PATCH"), false);
  }
});

test("source and route expose only Drive ACL capability orchestration", async () => {
  const [core, barrel, route, rehearsalClient, persistentClient, receiptServer,
    migration] = await Promise.all([
    read("lib/production-google-writer-fence-rehearsal.js"),
    read("lib/production-google-writer-fence-rehearsal-server.js"),
    read("app/api/admin/step11-6-production-google-writer-fence/route.js"),
    read("app/admin/step11-6-production-google-writer-fence/WriterFenceClient.js"),
    read("app/admin/step12-production-google-writer-provider-fence/PersistentWriterFenceClient.js"),
    read("lib/production-google-writer-fence-receipt-server.js"),
    read("supabase/production_migrations/202608260040_production_provider_inventory_recertification_v4.sql"),
  ]);
  for (const retiredTransport of [
    "sheets.googleapis.com", "spreadsheets.readonly", "addProtectedRange",
    "updateProtectedRange", "deleteProtectedRange", ":batchUpdate",
  ]) assert.doesNotMatch(core, new RegExp(retiredTransport.replace(".", "\\.")));
  assert.match(core, /recoverProductionGoogleDriveAclTransitionOutcome/);
  assert.match(core, /databaseRecoveryCapability/);
  assert.match(core, /databaseDispatchCapability/);
  assert.match(core, /acceptProductionGoogleDriveAclProviderMutationDispatch/);
  assert.match(core, /await inspectOwnedControlReceipt\(/);
  assert.doesNotMatch(core, /recordAclDispatchResult/);
  assert.match(core, /AbortSignal\.timeout\(GOOGLE_OAUTH_REQUEST_TIMEOUT_MS\)/);
  assert.match(core, /STEP11_6_PROTECTED_RANGE_REHEARSAL_RETIRED/);
  assert.doesNotMatch(barrel, /executeProductionGoogleWriterFenceRehearsal/);
  assert.doesNotMatch(route, /executeProductionGoogleWriterFenceRehearsal/);
  assert.match(route, /"criticalWafEpochId"/);
  assert.match(route,
    /receipt\.criticalWafEpochId \|\| receipt\.critical_waf_epoch_id/);
  for (const client of [rehearsalClient, persistentClient]) {
    assert.match(client, /criticalWafEpochId/);
    assert.match(client, /noSheetsTransportSentinelFingerprint/);
    assert.doesNotMatch(client, /inspection\?\.canonicalValueFingerprint/);
  }
  assert.match(receiptServer, /critical_waf_epoch_id:/);
  assert.match(receiptServer,
    /details\.criticalWafEpochId \|\| input\.criticalWafEpochId/);
  assert.match(receiptServer,
    /\["ACL_READER_CONFIRMED", "SETTLEMENT_READBACK_1"\]/);
  assert.match(migration, /waf_epoch\.status is distinct from 'ACTIVE_UNBOUND'/);
  assert.match(migration, /waf_epoch\.bound_fence_id is not null/);
  assert.match(migration,
    /fence\.critical_waf_epoch_id is distinct from\s*\(input->>'critical_waf_epoch_id'\)::uuid/);
  const responseMarker =
    "create or replace function production_control.google_writer_provider_fence_response(";
  const finalResponseStart = migration.lastIndexOf(responseMarker);
  assert.notEqual(finalResponseStart, -1,
    "the final effective provider-fence response must remain discoverable");
  const nextFunctionStart = migration.indexOf(
    "create or replace function ",
    finalResponseStart + responseMarker.length,
  );
  const finalResponseDefinition = migration.slice(
    finalResponseStart,
    nextFunctionStart === -1 ? undefined : nextFunctionStart,
  );
  for (const durableBaselineField of [
    "baseline_provider_fingerprint",
    "baseline_acl_fingerprint",
    "baseline_canonical_value_fingerprint",
    "baseline_formula_fingerprint",
    "baseline_combined_value_fingerprint",
    "writer_scope_fingerprint",
  ]) assert.match(finalResponseDefinition, new RegExp(durableBaselineField),
    `the final receipt projection must expose ${durableBaselineField}`);
});

test("refresh and retired direct rehearsal are explicit, never silent fallbacks", async () => {
  await assert.rejects(
    () => executeProductionGoogleWriterProviderFence(
      exactInput("refresh"),
      { env: rehearsalEnvironment(), fetchImpl: async () => {
        throw new Error("refresh must not access provider");
      } },
    ),
    { code: "STEP12_GOOGLE_DRIVE_ACL_REFRESH_RETIRED", status: 410 },
  );
  const source = await read("lib/production-google-writer-fence-rehearsal.js");
  assert.doesNotMatch(source,
    /executeProductionGoogleWriterFenceRehearsalWithDependencies/);
});

test("public errors preserve bounded safe diagnostics and redact private messages", () => {
  const error = Object.assign(new Error(
    "private owner@example.test token-secret",
  ), {
    code: "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN",
    status: 503,
    safeDiagnostics: {
      providerMutationRecoveryRequired: true,
      outcomeClassification: "UNKNOWN",
    },
  });
  const payload = publicProductionGoogleWriterFenceError(error);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, error.code);
  assert.equal(payload.error.includes("owner@example.test"), false);
  assert.equal(payload.diagnostics.providerMutationRecoveryRequired, true);
  assert.equal(payload.diagnostics.outcomeClassification, "UNKNOWN");
  assert.equal(JSON.stringify(payload).includes("token-secret"), false);
});

test("production execution dependencies remain module-owned", () => {
  const moduleUrl = new URL(
    "../lib/production-google-writer-fence-rehearsal.js",
    import.meta.url,
  ).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    const mod = await import(${JSON.stringify(moduleUrl)});
    try {
      await mod.executeProductionGoogleWriterProviderFence({}, {
        env: {},
        fetchImpl: async () => new Response(),
      });
    } catch (error) {
      process.stdout.write(JSON.stringify({ code: error.code, status: error.status }));
    }
  `], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_TEST_CONTEXT: "" },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_DEPENDENCY_INJECTION_FORBIDDEN",
    status: 500,
  });
});
}
