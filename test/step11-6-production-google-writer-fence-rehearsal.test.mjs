import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  executeProductionGoogleWriterFenceRehearsal,
  executeProductionGoogleWriterProviderFence,
  productionGoogleWriterFenceRehearsalEnvironment,
  productionGoogleWriterProviderFenceEnvironment,
  PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
  PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION,
  PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS,
} from "../lib/production-google-writer-fence-rehearsal.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES } from "../lib/google-workbook-mutation-intent.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from "../lib/google-service-account-credential-context.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => readFile(path.join(root, relative), "utf8");
const commitSha = "7".repeat(40);
const candidateHostname = "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app";
const dedicatedEmail = "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com";
const legacyEmail = "legacy-writer@sandbagger-invitational.iam.gserviceaccount.com";
const runId = "22222222-2222-4222-8222-222222222222";
const descriptionPrefix = `${PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION}:${runId}`;
const persistentFenceId = "44444444-4444-4444-8444-444444444444";
const persistentInstallId = "55555555-5555-4555-8555-555555555555";
const persistentVerificationId = "66666666-6666-4666-8666-666666666666";
const persistentQuiesceId = "77777777-7777-4777-8777-777777777777";
const EXPECTED_METADATA_FIELDS = [
  "spreadsheetId",
  "properties(title,locale,timeZone)",
  "namedRanges(namedRangeId,name,range)",
  "sheets(properties(sheetId,title,index,hidden,rightToLeft,gridProperties)," +
    "protectedRanges(protectedRangeId,description,warningOnly,range," +
    "editors(users,groups,domainUsersCanEdit),requestingUserCanEdit)," +
    "filterViews(filterViewId,title,range),basicFilter(range),merges)",
].join(",");
const EXPECTED_CANONICAL_VALUE_RANGES = PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES
  .map((title) => `'${title.replaceAll("'", "''")}'`);

function privateKey() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  });
}

const legacyPrivateKey = privateKey();
const dedicatedPrivateKey = privateKey();

function environment(overrides = {}) {
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
    PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
    PRODUCTION_FOUNDATION_ENABLED: "true",
    PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_URL,
    PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"s".repeat(40)}`,
    GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
    NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: `sb_publishable_${"p".repeat(32)}`,
    PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
    SCORING_AUTHORITY: "google",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
    PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
    PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
    NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "turnstile-public-test-key",
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

function input(action, baseline = "", canonicalValues = "") {
  return {
    action,
    operationRequestId: "11111111-1111-4111-8111-111111111111",
    expectedCommitSha: commitSha,
    expectedWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    expectedBranch: PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
    expectedDirectorPlayerId: "CB01",
    rehearsalRunId: action === "restore" ? runId : "",
    rehearsalRequestId: action === "restore" ? "11111111-1111-4111-8111-111111111111" : "",
    expectedBaselineFingerprint: baseline,
    expectedCanonicalValueFingerprint: canonicalValues,
    confirmation: action === "inspect" ? "" : PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION,
    quiesceEvidenceId: action === "rehearse"
      ? "33333333-3333-4333-8333-333333333333" : "",
  };
}

function provider({
  canaryStatus = 403,
  loseAddResponse = false,
  loseDeleteResponse = false,
  driftValuesAfterCanary = false,
  broadDriveEditor = false,
  drivePermissionStatus = 200,
  drivePermissionReason = "accessNotConfigured",
  redactLegacyEditors = true,
  legacyProtectionVariant = "",
} = {}) {
  let installed = false;
  let addResponseLost = false;
  let deleteResponseLost = false;
  let canaryAttempted = false;
  let activeDescriptionPrefix = descriptionPrefix;
  let nextProtectionId = 9000;
  const calls = [];
  const tokenIdentity = new Map();

  function tokenIssuer(request) {
    const assertion = new URLSearchParams(request.body).get("assertion");
    const payload = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"));
    const token = payload.iss === dedicatedEmail ? "dedicated-token" : "legacy-token";
    tokenIdentity.set(token, payload.iss);
    return Response.json({ access_token: token, expires_in: 900 });
  }

  function metadata(identity) {
    const requestingUserCanEdit = identity === dedicatedEmail;
    const canonical = Object.entries(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS).map(([title, sheetId]) => ({
      properties: {
        sheetId,
        title,
        index: sheetId === 0 ? 0 : 1,
        gridProperties: { rowCount: 1000, columnCount: 26 },
      },
      protectedRanges: installed ? [{
        protectedRangeId: 9000 + sheetId,
        description: `${activeDescriptionPrefix}:${sheetId}`,
        warningOnly: false,
        range: { sheetId },
        editors: { users: [dedicatedEmail], domainUsersCanEdit: false },
        requestingUserCanEdit,
      }] : [],
    }));
    if (installed && identity === legacyEmail) {
      for (const sheet of canonical) {
        if (redactLegacyEditors) delete sheet.protectedRanges[0].editors;
      }
      const target = canonical[0].protectedRanges[0];
      if (legacyProtectionVariant === "WRONG_ID") {
        target.protectedRangeId += 1_000_000;
      } else if (legacyProtectionVariant === "MISSING_ID") {
        delete target.protectedRangeId;
      } else if (legacyProtectionVariant === "WRONG_STRUCTURE") {
        target.range = { ...target.range, startRowIndex: 0 };
      } else if (legacyProtectionVariant === "EXTRA_TAGGED") {
        canonical[0].protectedRanges.push({
          ...target,
          protectedRangeId: target.protectedRangeId + 1_000_000,
        });
      } else if (legacyProtectionVariant === "CAN_EDIT_TRUE") {
        target.requestingUserCanEdit = true;
      } else if (legacyProtectionVariant === "WRONG_EDITORS") {
        target.editors = {
          users: [legacyEmail],
          groups: [],
          domainUsersCanEdit: false,
        };
      }
    }
    return {
      spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      properties: { title: "Production", locale: "en_US", timeZone: "America/Chicago" },
      namedRanges: [],
      sheets: [...canonical, {
        properties: {
          sheetId: 2121212121,
          title: "Participant Identity Configuration",
          index: 45,
          gridProperties: { rowCount: 1000, columnCount: 20 },
        },
        protectedRanges: [{
          protectedRangeId: 77,
          description: "unrelated-existing-protection",
          warningOnly: false,
          range: { sheetId: 2121212121, startColumnIndex: 4, endColumnIndex: 5 },
          editors: { users: [dedicatedEmail], domainUsersCanEdit: false },
          requestingUserCanEdit,
        }],
      }],
    };
  }

  async function fetchImpl(url, request = {}) {
    calls.push({ url: String(url), request });
    if (String(url) === "https://oauth2.googleapis.com/token") return tokenIssuer(request);
    const token = String(request.headers?.authorization || "").replace(/^Bearer /, "");
    const identity = tokenIdentity.get(token);
    if (!identity) return Response.json({}, { status: 401 });
    if (String(url).includes("www.googleapis.com/drive/v3/files/")) {
      if (drivePermissionStatus !== 200) {
        return Response.json({ error: {
          status: "PERMISSION_DENIED",
          errors: [{ reason: drivePermissionReason, message: "must not be exposed" }],
        } },
          { status: drivePermissionStatus });
      }
      return Response.json({
        permissions: [
          {
            id: "owner-permission",
            type: "user",
            role: "owner",
            emailAddress: "owner@example.test",
          },
          {
            id: "dedicated-permission",
            type: "user",
            role: "writer",
            emailAddress: dedicatedEmail,
          },
          {
            id: "legacy-permission",
            type: "user",
            role: "writer",
            emailAddress: legacyEmail,
          },
          {
            id: "reader-permission",
            type: broadDriveEditor ? "domain" : "anyone",
            role: broadDriveEditor ? "writer" : "reader",
            domain: broadDriveEditor ? "example.test" : undefined,
            allowFileDiscovery: false,
          },
        ],
      });
    }
    if (String(url).includes("/values:batchGet")) {
      const parsed = new URL(String(url));
      assert.equal(request.method, "GET");
      assert.equal(parsed.pathname,
        `/v4/spreadsheets/${PRODUCTION_GOOGLE_WORKBOOK_ID}/values:batchGet`);
      assert.deepEqual(parsed.searchParams.getAll("ranges"),
        EXPECTED_CANONICAL_VALUE_RANGES);
      assert.equal(parsed.searchParams.get("majorDimension"), "ROWS");
      assert.ok(["FORMULA", "UNFORMATTED_VALUE"].includes(
        parsed.searchParams.get("valueRenderOption"),
      ));
      assert.equal(parsed.searchParams.get("dateTimeRenderOption"), "SERIAL_NUMBER");
      return Response.json({
        valueRanges: PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.map((title, index) => ({
          range: `'${title}'!A1:ZZ1000`,
          majorDimension: "ROWS",
          values: [[title, driftValuesAfterCanary && canaryAttempted && index === 0 ? "drift" : "stable"]],
        })),
      });
    }
    if (String(url).endsWith(":batchUpdate")) {
      const body = JSON.parse(request.body);
      assert.ok(body.requests.length > 0);
      assert.equal(body.requests.some((item) => item.updateCells || item.updateSheetProperties || item.deleteSheet), false);
      if (identity === legacyEmail) {
        assert.equal(body.requests.length, 1);
        assert.equal(body.requests[0].updateProtectedRange?.fields, "description");
        assert.match(body.requests[0].updateProtectedRange?.protectedRange?.description,
          /^(?:STEP11_6_WRITER_FENCE_REHEARSAL|STEP12_GOOGLE_WRITER_PROVIDER_FENCE):[0-9a-f-]{36}:/);
        canaryAttempted = true;
        return Response.json(canaryStatus === 403
          ? { error: { status: "PERMISSION_DENIED" } }
          : { replies: [{}] }, { status: canaryStatus });
      }
      assert.equal(identity, dedicatedEmail);
      if (body.requests[0].addProtectedRange) {
        assert.equal(installed, false);
        assert.equal(body.requests.length, 17);
        activeDescriptionPrefix = body.requests[0].addProtectedRange
          .protectedRange.description.replace(/:[0-9]+$/, "");
        for (const item of body.requests) {
          const protection = item.addProtectedRange.protectedRange;
          assert.deepEqual(Object.keys(protection.range), ["sheetId"]);
          assert.equal(protection.warningOnly, false);
          assert.equal(protection.description,
            `${activeDescriptionPrefix}:${protection.range.sheetId}`);
          assert.deepEqual(protection.editors, {
            users: [dedicatedEmail],
            domainUsersCanEdit: false,
          });
        }
        installed = true;
        if (loseAddResponse && !addResponseLost) {
          addResponseLost = true;
          throw new TypeError("simulated lost add response");
        }
      } else {
        assert.equal(body.requests.length, 17);
        assert.ok(body.requests.every((item) => Number.isInteger(item.deleteProtectedRange?.protectedRangeId)));
        installed = false;
        if (loseDeleteResponse && !deleteResponseLost) {
          deleteResponseLost = true;
          throw new TypeError("simulated lost delete response");
        }
      }
      nextProtectionId += body.requests.length;
      return Response.json({ replies: [] });
    }
    const parsed = new URL(String(url));
    assert.equal(request.method, "GET");
    assert.equal(parsed.pathname,
      `/v4/spreadsheets/${PRODUCTION_GOOGLE_WORKBOOK_ID}`);
    assert.deepEqual([...new Set(parsed.searchParams.keys())].sort(),
      ["fields", "includeGridData"]);
    assert.equal(parsed.searchParams.get("includeGridData"), "false");
    assert.equal(parsed.searchParams.get("fields"), EXPECTED_METADATA_FIELDS);
    assert.doesNotMatch(parsed.searchParams.get("fields"),
      /spreadsheetIdproperties|\)namedRanges|\)sheets/);
    return Response.json(metadata(identity));
  }

  return {
    fetchImpl,
    calls,
    installed: () => installed,
    unusedCounter: () => nextProtectionId,
  };
}

function receipt() {
  const begun = [];
  const finished = [];
  return {
    begin: async (payload) => {
      begun.push(payload);
      return {
        runId,
        status: "RUNNING",
        protectionDescriptionPrefix: descriptionPrefix,
      };
    },
    inspect: async () => ({
      runId,
      status: "RUNNING",
      protectionDescriptionPrefix: descriptionPrefix,
    }),
    finish: async (payload) => { finished.push(payload); return { ok: true }; },
    begun,
    finished,
  };
}

function persistentEnvironment(overrides = {}) {
  return environment({
    VERCEL_ENV: "production",
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

function persistentInput(action, extra = {}) {
  return {
    action,
    operationRequestId: action === "install"
      ? persistentInstallId : "88888888-8888-4888-8888-888888888888",
    expectedCommitSha: commitSha,
    expectedWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    expectedBranch: PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
    expectedDirectorPlayerId: "CB01",
    installRequestId: action === "install" ? "" : persistentInstallId,
    fenceId: action === "install" ? "" : persistentFenceId,
    currentVerificationId: action === "install" ? "" : persistentVerificationId,
    quiesceEvidenceId: persistentQuiesceId,
    expectedBaselineFingerprint: "",
    expectedCanonicalValueFingerprint: "",
    confirmation: action === "install"
      ? "STEP12_GOOGLE_WRITER_PROVIDER_FENCE"
      : action === "remove" ? "REMOVE_STEP12_GOOGLE_WRITER_PROVIDER_FENCE" : "",
    ...extra,
  };
}

test("fixed Production provider IDs exactly equal the canonical legacy writer union", () => {
  assert.deepEqual(Object.keys(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS).sort(),
    [...PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES].sort());
  assert.equal(Object.keys(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS).length, 17);
  assert.equal(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS["Players"], 0);
  assert.equal(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS["Handicaps"], 1940053655);
});

test("environment requires exact candidate SHA/branch/workbook and separated public keys", () => {
  const ready = productionGoogleWriterFenceRehearsalEnvironment(environment());
  assert.equal(ready.allowed, true);
  assert.equal(ready.credentials.separated, true);
  assert.match(ready.credentials.legacyPublicKeySha256, /^[0-9a-f]{64}$/);
  assert.match(ready.credentials.dedicatedPublicKeySha256, /^[0-9a-f]{64}$/);
  assert.equal(ready.safety.providerValueWriteAttempted, false);
  assert.equal(ready.safety.automaticRestore, true);
  assert.equal(ready.safety.protectedIdentityScope, "LEGACY_SERVICE_ACCOUNT_ONLY");
  assert.equal(ready.safety.spreadsheetOwnerOverrideTested, false);
  assert.equal(productionGoogleWriterFenceRehearsalEnvironment(environment({
    VERCEL_GIT_COMMIT_REF: "main",
  })).allowed, false);
  assert.equal(productionGoogleWriterFenceRehearsalEnvironment(environment({
    PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA: "8".repeat(40),
  })).allowed, false);
  assert.equal(productionGoogleWriterFenceRehearsalEnvironment(environment({
    PRODUCTION_GOOGLE_PRIVATE_KEY: legacyPrivateKey,
  })).allowed, false);
});

test("read-only Inspect uses exact metadata fields and ordered whole-sheet value reads", async () => {
  const google = provider();
  const result = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(),
    fetchImpl: google.fetchImpl,
  });
  assert.equal(result.ok, true);
  const providerCalls = google.calls.filter((call) =>
    call.url !== "https://oauth2.googleapis.com/token");
  assert.deepEqual(providerCalls.map((call) => {
    const parsed = new URL(call.url);
    if (parsed.hostname === "sheets.googleapis.com" &&
        parsed.pathname.endsWith("/values:batchGet")) {
      return `VALUES:${parsed.searchParams.get("valueRenderOption")}`;
    }
    if (parsed.hostname === "sheets.googleapis.com") return "METADATA";
    if (parsed.hostname === "www.googleapis.com") return "DRIVE_PERMISSIONS";
    return "UNEXPECTED";
  }), [
    "METADATA",
    "VALUES:FORMULA",
    "VALUES:UNFORMATTED_VALUE",
    "DRIVE_PERMISSIONS",
  ]);
  assert.ok(providerCalls.every((call) => call.request.method === "GET"));
  assert.equal(providerCalls.some((call) => call.url.endsWith(":batchUpdate")), false);
  assert.equal(result.providerMutations, 0);
  assert.equal(result.applicationDataWriteIssued, false);
});

test("rehearsal accepts provider-redacted legacy editors while preserving exact fence proof", async () => {
  const google = provider();
  const receipts = receipt();
  const inspected = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(),
    fetchImpl: google.fetchImpl,
  });
  assert.equal(inspected.inspection.state, "ABSENT");
  assert.equal(inspected.inspection.canonicalSheetCount, 17);
  const result = await executeProductionGoogleWriterFenceRehearsal(
    input("rehearse", inspected.inspection.baselineMetadataFingerprint,
      inspected.inspection.canonicalValueFingerprint),
    { env: environment(), fetchImpl: google.fetchImpl, receipt: receipts },
  );
  assert.equal(result.ok, true);
  assert.equal(result.inspection.state, "ABSENT");
  assert.equal(result.baselineRestored, true);
  assert.equal(result.restoreRequired, false);
  assert.equal(result.providerMutations, 2);
  assert.equal(result.providerProof.protectedSheetCount, 17);
  assert.equal(result.providerProof.dedicatedRequestingUserCanEditCount, 17);
  assert.equal(result.providerProof.legacyRequestingUserDeniedCount, 17);
  assert.equal(result.providerProof.providerValueWriteAttempted, false);
  assert.equal(result.providerProof.legacyProviderStructuralWriteAttempts, 1);
  assert.equal(result.providerProof.legacyProviderStructuralWritesAccepted, 0);
  assert.equal(result.providerProof.structuralCanary.providerRejected, true);
  assert.equal(result.providerProof.structuralCanary.providerValueWriteAttempted, false);
  assert.equal(result.applicationDataWriteIssued, false);
  assert.equal(result.applicationDataChanged, false);
  assert.equal(result.canonicalValueFingerprintStable, true);
  assert.equal(result.providerProof.spreadsheetOwnerOverrideTested, false);
  assert.equal(result.providerProof.drivePermissionAudit.ownerCount, 1);
  assert.equal(result.providerProof.drivePermissionAudit.broadNonOwnerEditorCount, 0);
  assert.equal(result.providerProof.drivePermissionAudit.dedicatedIdentityIsOwner, false);
  assert.match(result.providerProof.drivePermissionAudit.ownerPrincipalFingerprint,
    /^[0-9a-f]{64}$/);
  assert.equal(google.installed(), false);
  assert.equal(receipts.begun.length, 1);
  assert.match(receipts.begun[0].baselineProviderFingerprint, /^[0-9a-f]{64}$/);
  assert.match(receipts.begun[0].baselineCanonicalValueFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(receipts.begun[0].controlEvidence.quiesceEvidenceId,
    "33333333-3333-4333-8333-333333333333");
  assert.match(receipts.begun[0].controlEvidence.ownerPrincipalFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(receipts.finished.length, 1);
  assert.equal(receipts.finished[0].outcome, "RESTORED");
  assert.equal(receipts.finished[0].runOwnedProtectionIds.length, 17);
  assert.equal(receipts.finished[0].activeRunOwnedProtectionCount, 0);
  assert.equal(receipts.finished[0].dedicatedIdentityCanEdit, true);
  assert.equal(receipts.finished[0].legacyIdentityDenied, true);
  for (const key of [
    "providerEvidenceFingerprint",
    "fencedProviderFingerprint",
    "restoredProviderFingerprint",
    "restoredProtectedRangesFingerprint",
    "restoredCanonicalValueFingerprint",
    "restorationEvidenceFingerprint",
  ]) assert.match(receipts.finished[0][key], /^[0-9a-f]{64}$/);
  const sheetsWrites = google.calls.filter((call) => call.url.endsWith(":batchUpdate"));
  assert.equal(sheetsWrites.length, 3);
});

test("legacy redacted view rejects protection identity, structure, tag, editor, and editability drift", async (t) => {
  for (const variant of [
    "WRONG_ID",
    "MISSING_ID",
    "WRONG_STRUCTURE",
    "EXTRA_TAGGED",
    "WRONG_EDITORS",
    "CAN_EDIT_TRUE",
  ]) {
    await t.test(variant, async () => {
      const google = provider({ legacyProtectionVariant: variant });
      const inspected = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
        env: environment(),
        fetchImpl: google.fetchImpl,
      });
      await assert.rejects(() => executeProductionGoogleWriterFenceRehearsal(
        input(
          "rehearse",
          inspected.inspection.baselineMetadataFingerprint,
          inspected.inspection.canonicalValueFingerprint,
        ),
        { env: environment(), fetchImpl: google.fetchImpl, receipt: receipt() },
      ), (error) =>
        error.code === "STEP11_6_GOOGLE_WRITER_FENCE_IDENTITY_VIEW_MISMATCH");
      assert.equal(google.installed(), false,
        "the dedicated identity must restore the exact baseline after rejection");
    });
  }
});

test("recovery restore is idempotent when the exact baseline is already present", async () => {
  const google = provider();
  const inspected = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  });
  const restored = await executeProductionGoogleWriterFenceRehearsal(
    input("restore", inspected.inspection.baselineMetadataFingerprint,
      inspected.inspection.canonicalValueFingerprint),
    { env: environment(), fetchImpl: google.fetchImpl, receipt: receipt() },
  );
  assert.equal(restored.idempotent, true);
  assert.equal(restored.providerMutations, 0);
  assert.equal(restored.baselineRestored, true);
});

test("lost add and restore responses reconcile from provider state without duplicate ranges", async () => {
  const google = provider({ loseAddResponse: true, loseDeleteResponse: true });
  const inspected = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  });
  const result = await executeProductionGoogleWriterFenceRehearsal(
    input("rehearse", inspected.inspection.baselineMetadataFingerprint,
      inspected.inspection.canonicalValueFingerprint),
    { env: environment(), fetchImpl: google.fetchImpl, receipt: receipt() },
  );
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.lostResponseRecovered, true);
  assert.equal(result.inspection.state, "ABSENT");
  assert.equal(google.installed(), false);
});

test("a non-rejected legacy canary fails certification but automatic restore still wins", async () => {
  const google = provider({ canaryStatus: 200 });
  const inspected = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  });
  await assert.rejects(() => executeProductionGoogleWriterFenceRehearsal(
    input("rehearse", inspected.inspection.baselineMetadataFingerprint,
      inspected.inspection.canonicalValueFingerprint),
    { env: environment(), fetchImpl: google.fetchImpl, receipt: receipt() },
  ), (error) => {
    assert.equal(error.code, "STEP11_6_GOOGLE_WRITER_FENCE_CANARY_NOT_REJECTED");
    assert.equal(error.safeDiagnostics.baselineRestored, true);
    assert.equal(error.safeDiagnostics.restoreRequired, false);
    return true;
  });
  assert.equal(google.installed(), false);
});

test("canonical value drift fails certification and still restores every run-owned protection", async () => {
  const google = provider({ driftValuesAfterCanary: true });
  const inspected = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  });
  await assert.rejects(() => executeProductionGoogleWriterFenceRehearsal(
    input("rehearse", inspected.inspection.baselineMetadataFingerprint,
      inspected.inspection.canonicalValueFingerprint),
    { env: environment(), fetchImpl: google.fetchImpl, receipt: receipt() },
  ), (error) => {
    assert.equal(error.code, "STEP11_6_GOOGLE_WRITER_FENCE_CANONICAL_VALUE_DRIFT");
    assert.equal(error.safeDiagnostics.baselineRestored, true);
    assert.equal(error.safeDiagnostics.restoreRequired, false);
    return true;
  });
  assert.equal(google.installed(), false);
});

test("Drive ACL inventory fails closed on a broad editor", async () => {
  const google = provider({ broadDriveEditor: true });
  await assert.rejects(() => executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  }), (error) => {
    assert.equal(error.code, "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_UNSAFE");
    return true;
  });
  assert.equal(google.installed(), false);
});

test("Drive rejection exposes only canonical provider reason tokens", async () => {
  const google = provider({ drivePermissionStatus: 403 });
  await assert.rejects(() => executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  }), (error) => {
    assert.equal(error.code,
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_REJECTED");
    assert.equal(error.safeDiagnostics.providerStatus, 403);
    assert.deepEqual(error.safeDiagnostics.providerReasons,
      ["PERMISSION_DENIED", "accessNotConfigured"]);
    assert.doesNotMatch(JSON.stringify(error.safeDiagnostics),
      /message|email|private|token|workbook/i);
    return true;
  });
  assert.equal(google.installed(), false);
});

test("Step 12 persistent fence stays installed until an authoritative removal receipt", async () => {
  assert.equal(productionGoogleWriterProviderFenceEnvironment(persistentEnvironment()).allowed,
    true);
  assert.equal(productionGoogleWriterProviderFenceEnvironment(persistentEnvironment()).safety
    .automaticRestore, false);
  assert.equal(productionGoogleWriterProviderFenceEnvironment(persistentEnvironment({
    VERCEL_ENV: "preview",
  })).allowed, false);
  assert.equal(productionGoogleWriterProviderFenceEnvironment(persistentEnvironment({
    PRODUCTION_CUTOVER_PHASE: "IDENTITY",
  })).allowed, false);
  assert.equal(productionGoogleWriterProviderFenceEnvironment(persistentEnvironment({
    PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED: "true",
  })).allowed, false);
  const google = provider({ loseDeleteResponse: true });
  const inspected = await executeProductionGoogleWriterProviderFence(
    persistentInput("inspect", {
      operationRequestId: "99999999-9999-4999-8999-999999999999",
      installRequestId: "",
      fenceId: "",
      currentVerificationId: "",
    }),
    { env: persistentEnvironment(), fetchImpl: google.fetchImpl },
  );
  const prefix = `STEP12_GOOGLE_WRITER_PROVIDER_FENCE:${persistentFenceId}`;
  let finishInstallDetails;
  const installControl = {
    discoverInstall: async () => ({ found: false }),
    beginInstall: async () => ({
      fenceId: persistentFenceId,
      installRequestId: persistentInstallId,
      quiesceEvidenceId: persistentQuiesceId,
      status: "INSTALLING",
      protectionDescriptionPrefix: prefix,
    }),
    finishInstall: async (details) => {
      finishInstallDetails = details;
      return {
        fenceId: persistentFenceId,
        installRequestId: persistentInstallId,
        quiesceEvidenceId: persistentQuiesceId,
        status: "INSTALLED",
        protectionDescriptionPrefix: prefix,
        activeVerificationId: persistentVerificationId,
      };
    },
  };
  const installed = await executeProductionGoogleWriterProviderFence(
    persistentInput("install", {
      expectedBaselineFingerprint: inspected.inspection.baselineMetadataFingerprint,
      expectedCanonicalValueFingerprint: inspected.inspection.canonicalValueFingerprint,
    }),
    { env: persistentEnvironment(), fetchImpl: google.fetchImpl, control: installControl },
  );
  assert.equal(installed.persistentFenceActive, true);
  assert.equal(google.installed(), true);
  assert.equal(finishInstallDetails.protectionRecords.length, 17);
  assert.ok(finishInstallDetails.protectionRecords.every((record) =>
    record.warningOnly === false && record.dedicatedRequestingUserCanEdit === true &&
    record.legacyRequestingUserCanEdit === false));
  assert.match(finishInstallDetails.installedCanonicalValueFingerprint, /^[0-9a-f]{64}$/);
  assert.match(finishInstallDetails.installedFormulaFingerprint, /^[0-9a-f]{64}$/);

  let lostRefreshDetails = null;
  let refreshCalls = 0;
  const refreshedVerificationId = "99999999-9999-4999-8999-999999999999";
  const refreshReceipt = () => ({
    fenceId: persistentFenceId,
    installRequestId: persistentInstallId,
    quiesceEvidenceId: persistentQuiesceId,
    status: "INSTALLED",
    protectionDescriptionPrefix: prefix,
    activeVerificationId: lostRefreshDetails
      ? refreshedVerificationId : persistentVerificationId,
    verification: lostRefreshDetails ? {
      verification_id: refreshedVerificationId,
      request_fingerprint: lostRefreshDetails.operationRequestFingerprint,
      quiesce_evidence_id: persistentQuiesceId,
      provider_fingerprint: lostRefreshDetails.providerFingerprint,
      acl_fingerprint: lostRefreshDetails.aclFingerprint,
      canonical_value_fingerprint: lostRefreshDetails.canonicalValueFingerprint,
      formula_fingerprint: lostRefreshDetails.formulaFingerprint,
    } : {
      verification_id: persistentVerificationId,
      request_fingerprint: "0".repeat(64),
      quiesce_evidence_id: persistentQuiesceId,
    },
  });
  const refreshControl = {
    inspect: async () => refreshReceipt(),
    refresh: async (details) => {
      refreshCalls += 1;
      lostRefreshDetails = details;
      throw Object.assign(new Error("simulated lost refresh response"), {
        code: "STEP12_PROVIDER_REFRESH_RESPONSE_UNKNOWN",
      });
    },
  };
  await assert.rejects(
    executeProductionGoogleWriterProviderFence(
      persistentInput("refresh"),
      { env: persistentEnvironment(), fetchImpl: google.fetchImpl, control: refreshControl },
    ),
    /simulated lost refresh response/,
  );
  const recoveredRefresh = await executeProductionGoogleWriterProviderFence(
    persistentInput("refresh"),
    { env: persistentEnvironment(), fetchImpl: google.fetchImpl, control: refreshControl },
  );
  assert.equal(recoveredRefresh.lostResponseRecovered, true);
  assert.equal(recoveredRefresh.idempotent, true);
  assert.equal(refreshCalls, 1);

  const protectedRangeIds = finishInstallDetails.protectionRecords
    .map((record) => record.protectedRangeId).sort((a, b) => a - b);
  await assert.rejects(
    executeProductionGoogleWriterProviderFence(
      persistentInput("remove"),
      {
        env: persistentEnvironment(),
        fetchImpl: google.fetchImpl,
        control: {
          inspect: async () => ({
            fenceId: persistentFenceId,
            installRequestId: persistentInstallId,
            quiesceEvidenceId: persistentQuiesceId,
            status: "REMOVAL_AUTHORIZED",
            removalRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            protectionDescriptionPrefix: prefix,
          }),
          authorizeRemoval: async () => assert.fail("must not authorize again"),
          finishRemoval: async () => assert.fail("must not remove a different request"),
        },
      },
    ),
    (error) => error.code ===
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_OWNERSHIP_MISMATCH",
  );
  assert.equal(google.installed(), true);
  let authorized = false;
  let finishedRemoval = false;
  const removalControl = {
    inspect: async () => ({
      fenceId: persistentFenceId,
      installRequestId: persistentInstallId,
      quiesceEvidenceId: persistentQuiesceId,
      status: "INSTALLED",
      protectionDescriptionPrefix: prefix,
      verification: {
        verification_id: persistentVerificationId,
        protected_sheet_ids: Object.values(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS)
          .sort((a, b) => a - b),
        protected_range_ids: protectedRangeIds,
      },
    }),
    authorizeRemoval: async (details) => {
      authorized = true;
      assert.match(details.currentProviderFingerprint, /^[0-9a-f]{64}$/);
      assert.match(details.currentProviderWithoutFenceFingerprint, /^[0-9a-f]{64}$/);
      return {
        fenceId: persistentFenceId,
        installRequestId: persistentInstallId,
        quiesceEvidenceId: persistentQuiesceId,
        status: "REMOVAL_AUTHORIZED",
        removalRequestId: "88888888-8888-4888-8888-888888888888",
        protectionDescriptionPrefix: prefix,
      };
    },
    finishRemoval: async (details) => {
      finishedRemoval = true;
      assert.equal(authorized, true);
      assert.equal(details.removedProtectionIds.length, 17);
      assert.equal(details.activeRunOwnedProtectionCount, 0);
      return {
        fenceId: persistentFenceId,
        installRequestId: persistentInstallId,
        quiesceEvidenceId: persistentQuiesceId,
        status: "REMOVED",
        removalRequestId: "88888888-8888-4888-8888-888888888888",
        protectionDescriptionPrefix: prefix,
      };
    },
  };
  const removed = await executeProductionGoogleWriterProviderFence(
    persistentInput("remove"),
    { env: persistentEnvironment(), fetchImpl: google.fetchImpl, control: removalControl },
  );
  assert.equal(removed.persistentFenceActive, false);
  assert.equal(removed.lostResponseRecovered, true);
  assert.equal(google.installed(), false);
  assert.equal(finishedRemoval, true);
});

test("route and pages require mode-specific same-origin Director auth and exact browser controls", async () => {
  const [route, page, client, persistentPage, persistentClient, authorization, core,
    receiptAdapter] = await Promise.all([
    read("app/api/admin/step11-6-production-google-writer-fence/route.js"),
    read("app/admin/step11-6-production-google-writer-fence/page.js"),
    read("app/admin/step11-6-production-google-writer-fence/WriterFenceClient.js"),
    read("app/admin/step12-production-google-writer-provider-fence/page.js"),
    read("app/admin/step12-production-google-writer-provider-fence/PersistentWriterFenceClient.js"),
    read("lib/preview-director-authorization.js"),
    read("lib/production-google-writer-fence-rehearsal.js"),
    read("lib/production-google-writer-fence-receipt-server.js"),
  ]);
  assert.match(route, /assertProductionShadowCandidateRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /production-shadow-entitlement/);
  assert.match(route, /production-director-entitlement/);
  assert.match(route, /PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR/);
  assert.match(route, /productionGoogleWriterFenceReceiptDependencies/);
  assert.match(route, /rehearsal:\s*productionGoogleWriterFenceReceiptDependencies/);
  assert.match(route,
    /inspectOwnerFingerprint\(\s*input,\s*purpose,\s*dependencies,?\s*\)/);
  assert.match(route, /candidateAliasOrigin/);
  assert.match(route, /candidateImmutableOrigin/);
  assert.match(route, /probeScopeFingerprint/);
  assert.match(route, /attesterRequestFromChallenge/);
  assert.match(route, /verifyVercelProviderAttestation/);
  assert.match(route, /reserveChallenge/);
  assert.doesNotMatch(route, /attestationId:\s*challenge\.challengeId/);
  assert.ok(route.indexOf("verifyVercelProviderAttestation(") <
    route.indexOf("dependencies.quiesce.reserveChallenge("));
  assert.ok(route.indexOf("dependencies.quiesce.reserveChallenge(") <
    route.indexOf("probeProductionWriterQuiesceOrigins("));
  assert.match(receiptAdapter, /originInventoryTuples/);
  assert.match(receiptAdapter,
    /consume_production_vercel_provider_attestation_challenge/);
  assert.match(page, /notFound\(\)/);
  assert.match(persistentPage, /production-director-entitlement/);
  for (const label of ["Inspect", "Apply Rehearsal Fence", "Restore"]) assert.match(client, new RegExp(label));
  assert.match(client, /credentials:\s*"same-origin"/);
  assert.match(persistentClient, /credentials:\s*"same-origin"/);
  assert.match(persistentClient, /quiesceEvidenceId:\s*state\.quiesceEvidenceId/);
  assert.match(authorization, /step11-6-production-google-writer-fence/);
  assert.doesNotMatch(core, /updateCells|values:batchUpdate|deleteSheet|updateSheetProperties/);
  assert.match(core, /requestingUserCanEdit/);
  assert.match(core, /finally/);
  assert.match(core, /productionCutoverActivationEnvironment/);
  for (const rpc of [
    "inspect_production_scoring_admission",
    "begin_production_google_writer_fence_rehearsal",
    "inspect_production_google_writer_fence_rehearsal",
    "finish_production_google_writer_fence_rehearsal",
  ]) assert.match(receiptAdapter, new RegExp(rpc));
  for (const field of [
    "baseline_canonical_value_fingerprint",
    "vercel_project_id",
    "dedicated_google_service_account",
    "writer_scope_fingerprint",
    "quiesce_evidence_id",
    "owner_principal_fingerprint",
    "canonical_sheet_union_fingerprint",
    "restored_canonical_value_fingerprint",
    "restoration_evidence_fingerprint",
    "run_owned_protection_ids",
    "active_run_owned_protection_count",
    "dedicated_identity_can_edit",
    "legacy_identity_denied",
    "google_value_writes_performed",
    "preview_resources_accessed",
    "restoration_confirmed",
    "combined_value_fingerprint",
    "structural_canary_fingerprint",
    "provider_fence_verification_id",
    "pre_remove_combined_value_fingerprint",
    "restored_combined_value_fingerprint",
  ]) assert.match(receiptAdapter, new RegExp(field));
  assert.doesNotMatch(receiptAdapter,
    /unresolved_request_log_count|unresolved_google_write_count/);
  assert.doesNotMatch(client, /edgeQuiesceFingerprint|originMatrixFingerprint|ownerAcknowledgedAt|ownerFreezeExpiresAt/);
  assert.doesNotMatch(persistentClient,
    /edgeQuiesceFingerprint|originMatrixFingerprint|ownerAcknowledgedAt|ownerFreezeExpiresAt/);
});

test("public results and source do not expose private keys, tokens, or service-account principals", async () => {
  const google = provider();
  const result = await executeProductionGoogleWriterFenceRehearsal(input("inspect"), {
    env: environment(), fetchImpl: google.fetchImpl,
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /BEGIN PRIVATE KEY|dedicated-token|legacy-token/);
  assert.doesNotMatch(serialized, new RegExp(dedicatedEmail.replaceAll(".", "\\.")));
  assert.doesNotMatch(serialized, new RegExp(legacyEmail.replaceAll(".", "\\.")));
  assert.equal(result.inspection.credentials.legacyPublicKeySha256.length, 64);
  assert.equal(result.inspection.credentials.dedicatedPublicKeySha256.length, 64);
});
