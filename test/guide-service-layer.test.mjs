import test from "node:test";
import assert from "node:assert/strict";

import {
  guideReadEnvironment,
  guideSyncEnvironment,
  guideWorkerAuthorized,
  guideWorkerServerConfiguration,
} from "../lib/guide-read-source.js";
import { guideValidationIssuesForDirector, synchronizeGuideContent } from "../lib/guide-sync-service.js";
import { GuideProjectionValidationError } from "../lib/tournament-guide-projection.js";

const workerSecret = "guide-worker-secret-32-characters-minimum";
const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-guide-workbook",
  GOOGLE_SHEETS_SPREADSHEET_ID: "preview-guide-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-guide-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  GUIDE_SYNC_TOURNAMENT_ID: "2026",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  GUIDE_AUTO_SYNC_ENABLED: "true",
  GUIDE_SYNC_WORKER_SECRET: workerSecret,
};

const rpc = (payload) => ({ payload, durationMs: 1 });
const canonicalContext = rpc({
  ok: true,
  data: {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
    course_context: [{
      course_id: "TPGC01", tee: "Blue", rating: 71.2, slope: 132, par: 72,
      rounds: [{ round_number: 1, format: "BB" }],
      holes: Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1, par: 4, stroke_index: index + 1, yardage: 400 })),
    }],
    query_ms: 2,
  },
});

test("Guide and course reads are Preview-only, workbook-isolated, and project-scoped", () => {
  const state = guideReadEnvironment(previewEnv);
  assert.equal(state.guide.resolved, "supabase");
  assert.equal(state.course.resolved, "supabase");
  assert.equal(state.supabaseEligible, true);

  const existingPreviewWithoutRedundantWorkbookVariable = guideReadEnvironment({
    ...previewEnv,
    PREVIEW_SCORING_SHEET_ID: "",
  });
  assert.equal(existingPreviewWithoutRedundantWorkbookVariable.guide.resolved, "supabase");
  assert.equal(existingPreviewWithoutRedundantWorkbookVariable.previewWorkbook, true);

  const wrongProject = guideReadEnvironment({ ...previewEnv, SUPABASE_SCORING_MIRROR_URL: "https://other.supabase.co" });
  assert.equal(wrongProject.guide.blocked, true);
  assert.equal(wrongProject.guide.reason, "preview-project-required");

  const production = guideReadEnvironment({ ...previewEnv, VERCEL_ENV: "production" });
  assert.equal(production.guide.resolved, "google");
  assert.equal(production.guide.productionBlocked, true);

  const missingCredentials = guideReadEnvironment({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" });
  assert.equal(missingCredentials.guide.blocked, true);
  assert.equal(missingCredentials.guide.resolved, "google");
  assert.equal(missingCredentials.guide.reason, "credentials-missing");

  const independentlyBlockedCourse = guideReadEnvironment({ ...previewEnv, COURSE_PRESENTATION_READ_SOURCE: "invalid" });
  assert.equal(independentlyBlockedCourse.guide.resolved, "supabase");
  assert.equal(independentlyBlockedCourse.course.blocked, true);
});

test("automatic sync is separately gated while manual sync remains eligible in isolated Preview", () => {
  assert.equal(guideSyncEnvironment(previewEnv).autoSyncEnabled, true);
  const manualOnly = guideSyncEnvironment({ ...previewEnv, GUIDE_AUTO_SYNC_ENABLED: "false" });
  assert.equal(manualOnly.administrativeEligible, true);
  assert.equal(manualOnly.autoSyncEnabled, false);
  assert.equal(guideSyncEnvironment({ ...previewEnv, GUIDE_SYNC_TOURNAMENT_ID: "3026" }).administrativeEligible, false);
});

test("Guide worker requires the separate application bearer secret", () => {
  assert.equal(guideWorkerAuthorized({ headers: new Headers() }, previewEnv), false);
  assert.equal(guideWorkerAuthorized({ headers: new Headers({ authorization: "Bearer wrong-secret" }) }, previewEnv), false);
  assert.equal(guideWorkerAuthorized({ headers: new Headers({ authorization: `Bearer ${workerSecret}` }) }, previewEnv), true);
});

test("Guide worker bootstrap takes its fixed endpoint and bearer only from server deployment configuration", () => {
  const configuration = guideWorkerServerConfiguration(previewEnv);
  assert.equal(configuration.ready, true);
  assert.equal(configuration.workerSecret, workerSecret);
  assert.equal(configuration.endpointUrl,
    "https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app/api/cron/guide-sync");
  assert.equal(guideWorkerServerConfiguration({ ...previewEnv, GUIDE_SYNC_WORKER_SECRET: "short" }).ready, false);
  assert.equal(guideWorkerServerConfiguration({ ...previewEnv, GUIDE_AUTO_SYNC_ENABLED: "false" }).ready, false);
});

test("canonical sync claims before Google, publishes one validated projection, and reports a no-op safely", async () => {
  const calls = [];
  let publishedInput;
  const result = await synchronizeGuideContent({
    triggerType: "SCHEDULED",
    requestedBy: "scheduler",
    env: previewEnv,
    dependencies: {
      claimGuideSync: async () => { calls.push("claim"); return rpc({ ok: true, claim_token: "claim", current_content_fingerprint: "f".repeat(64) }); },
      readGuideSourceContext: async () => { calls.push("context"); return canonicalContext; },
      readGoogleSheets: async () => { calls.push("google"); return { result: {}, diagnostics: { sheetsApiCalls: 1 } }; },
      buildGuideProjection: () => { calls.push("validate"); return {
        schemaVersion: "guide-projection-v1", sourceCounts: { schedule: 4 },
        sourceFingerprint: "a".repeat(64), contentFingerprint: "f".repeat(64),
        payloadHash: "b".repeat(64), content: { schedule: [] },
        sourceCanonicalJson: '{"source":"fixture"}',
        contentCanonicalJson: '{"schedule":[]}',
        payloadCanonicalJson: '{"schemaVersion":"guide-projection-v1","content":{"schedule":[]}}',
      }; },
      publishGuideProjection: async (input) => { calls.push("publish"); publishedInput = input; return rpc({ ok: true, changed: false, no_op: true, projection_revision: 3, content_fingerprint: "f".repeat(64) }); },
      failGuideSync: async () => { throw new Error("not expected"); },
    },
  });
  assert.deepEqual(calls, ["claim", "context", "google", "validate", "publish"]);
  assert.equal(result.ok, true);
  assert.equal(result.noOp, true);
  assert.equal(publishedInput.contentPayload.schemaVersion, "guide-projection-v1");
  assert.deepEqual(publishedInput.contentPayload.content, { schedule: [] });
  assert.equal(result.diagnostics.googleRequests, 1);
});

test("invalid Google content records a fixed safe failure and preserves last-known-good", async () => {
  let failure;
  const message = "Courses TPGC01:1 tee does not match canonical scoring configuration";
  const result = await synchronizeGuideContent({
    triggerType: "MANUAL",
    requestedBy: "director",
    env: { ...previewEnv, GUIDE_AUTO_SYNC_ENABLED: "false" },
    dependencies: {
      claimGuideSync: async () => rpc({ ok: true, claim_token: "claim" }),
      readGuideSourceContext: async () => canonicalContext,
      readGoogleSheets: async () => ({ result: {} }),
      buildGuideProjection: () => { throw new GuideProjectionValidationError([message], [{
        message,
        source: "Courses",
        entity: "TPGC01 · Round 1",
        field: "Tee Played",
        currentValue: "Blue",
        expectedValue: "Gold",
        valueSafe: true,
      }]); },
      publishGuideProjection: async () => { throw new Error("not expected"); },
      failGuideSync: async (input) => { failure = input; return rpc({ ok: true }); },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failureCategory, "VALIDATION");
  assert.equal(result.lastKnownGoodPreserved, true);
  assert.deepEqual(result.validationIssues, [{
    source: "Courses",
    entity: "TPGC01 · Round 1",
    field: "Tee Played",
    reason: message,
    currentValue: "Blue",
    expectedValue: "Gold",
  }]);
  assert.equal(failure.validationStatus, "INVALID");
  assert.equal(failure.failureSafe, "Google Guide content did not pass publication validation.");
  assert.equal(failure.auditMetadata.validationIssueCount, 1);
  assert.doesNotMatch(JSON.stringify(failure.auditMetadata), /Blue|Gold|TPGC01/);
});

test("Director validation diagnostics allowlist safe Guide values and never expose contact data or internal errors", () => {
  const contactMessage = "Important Contacts row 1 is missing Email";
  const error = new GuideProjectionValidationError([contactMessage], [{
    message: contactMessage,
    source: "Important Contacts",
    entity: "Director contact",
    field: "Email",
    currentValue: "private@example.com",
    expectedValue: "participant-safe email",
    valueSafe: true,
    stack: "database stack",
  }]);
  assert.deepEqual(guideValidationIssuesForDirector(error), [{
    source: "Important Contacts",
    entity: "Director contact",
    field: "Email",
    reason: contactMessage,
  }]);
});

test("transient Google failures are classified safely and preserve last-known-good", async () => {
  const failures = [
    { error: Object.assign(new Error("rate limited"), { status: 429 }), category: "GOOGLE_429" },
    { error: Object.assign(new Error("temporarily unavailable"), { status: 503 }), category: "GOOGLE_5XX" },
    { error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }), category: "GOOGLE_TIMEOUT" },
  ];

  for (const fixture of failures) {
    let recordedFailure;
    let publishCalled = false;
    const result = await synchronizeGuideContent({
      triggerType: "SCHEDULED",
      requestedBy: "scheduler",
      env: previewEnv,
      dependencies: {
        claimGuideSync: async () => rpc({ ok: true, claim_token: "claim" }),
        readGuideSourceContext: async () => canonicalContext,
        readGoogleSheets: async () => { throw fixture.error; },
        publishGuideProjection: async () => { publishCalled = true; return rpc({ ok: true }); },
        failGuideSync: async (input) => { recordedFailure = input; return rpc({ ok: true }); },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.failureCategory, fixture.category);
    assert.equal(result.lastKnownGoodPreserved, true);
    assert.equal(recordedFailure.failureCategory, fixture.category);
    assert.equal(recordedFailure.validationStatus, "NOT_RUN");
    assert.equal(publishCalled, false);
  }
});

test("Supabase publication failure is isolated and leaves the verified projection current", async () => {
  let recordedFailure;
  const result = await synchronizeGuideContent({
    triggerType: "MANUAL",
    requestedBy: "director",
    env: previewEnv,
    dependencies: {
      claimGuideSync: async () => rpc({ ok: true, claim_token: "claim", current_content_fingerprint: "e".repeat(64) }),
      readGuideSourceContext: async () => canonicalContext,
      readGoogleSheets: async () => ({ result: {}, diagnostics: { sheetsApiCalls: 1 } }),
      buildGuideProjection: () => ({
        schemaVersion: "guide-projection-v1",
        sourceCounts: { schedule: 4 },
        sourceFingerprint: "a".repeat(64),
        contentFingerprint: "f".repeat(64),
        payloadHash: "b".repeat(64),
        content: { schedule: [] },
        sourceCanonicalJson: '{"source":"fixture"}',
        contentCanonicalJson: '{"schedule":[]}',
        payloadCanonicalJson: '{"schemaVersion":"guide-projection-v1","content":{"schedule":[]}}',
      }),
      publishGuideProjection: async () => rpc({ ok: false, code: "GUIDE_PROJECTION_PUBLICATION_FAILED" }),
      failGuideSync: async (input) => { recordedFailure = input; return rpc({ ok: true }); },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failureCategory, "SUPABASE_SERVICE");
  assert.equal(result.lastKnownGoodPreserved, true);
  assert.equal(recordedFailure.failureCategory, "SUPABASE_SERVICE");
  assert.equal(recordedFailure.validationStatus, "NOT_RUN");
  assert.equal(recordedFailure.changed, true);
});

test("invalid Guide synchronization triggers and actors fail before any claim or Google read", async () => {
  let dependencyCalled = false;
  const dependencies = {
    claimGuideSync: async () => { dependencyCalled = true; return rpc({ ok: true }); },
    readGoogleSheets: async () => { dependencyCalled = true; return {}; },
  };

  await assert.rejects(() => synchronizeGuideContent({
    triggerType: "PARTICIPANT",
    requestedBy: "golfer",
    env: previewEnv,
    dependencies,
  }), /recognized Guide synchronization trigger/);
  await assert.rejects(() => synchronizeGuideContent({
    triggerType: "MANUAL",
    requestedBy: "   ",
    env: previewEnv,
    dependencies,
  }), /Guide synchronization actor is required/);
  assert.equal(dependencyCalled, false);
});

test("Production blocks synchronization before a claim or Google import", async () => {
  let called = false;
  await assert.rejects(() => synchronizeGuideContent({
    triggerType: "MANUAL",
    requestedBy: "director",
    env: { ...previewEnv, VERCEL_ENV: "production" },
    dependencies: { claimGuideSync: async () => { called = true; return rpc({ ok: true }); } },
  }), /production-hard-block/);
  assert.equal(called, false);
});
