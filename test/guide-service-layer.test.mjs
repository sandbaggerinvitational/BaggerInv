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

test("Guide and course read admission is canonical, independent, and Google-free", async () => {
const {assertCanonicalReadRetirementContract}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
assertCanonicalReadRetirementContract(env=>guideReadEnvironment(env).guide,'GUIDE_READ_SOURCE');
assertCanonicalReadRetirementContract(env=>guideReadEnvironment(env).course,'COURSE_PRESENTATION_READ_SOURCE');
const {canonicalReadFixture}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
const separate=guideReadEnvironment({...canonicalReadFixture,COURSE_PRESENTATION_READ_SOURCE:'typo'});assert.equal(separate.guide.resolved,'supabase');assert.equal(separate.course.blocked,true);
});

// Retired behavior: Automatic/manual Google Guide synchronization eligibility is retired; canonical Guide presentation is not delivery proof and needs its own tests. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


test("Guide worker requires the separate application bearer secret", () => {
  assert.equal(guideWorkerAuthorized({ headers: new Headers() }, previewEnv), false);
  assert.equal(guideWorkerAuthorized({ headers: new Headers({ authorization: "Bearer wrong-secret" }) }, previewEnv), false);
  assert.equal(guideWorkerAuthorized({ headers: new Headers({ authorization: `Bearer ${workerSecret}` }) }, previewEnv), true);
});

// Retired behavior: There is no automatic Google Guide worker bootstrap after retirement; terminal endpoint must not consume URL/token or initiate transport. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Claim/import/publish of Google Guide content is retired runtime behavior; preserve canonical Guide projection use and manual historical import provenance. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Invalid Google-content delivery failure handling is outside required runtime; test instead that current canonical Guide is independent of unavailable Google. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


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

// Retired behavior: Google transient retry classifier was part of retired Guide synchronization; it is not a reason to keep that worker required. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: This failure belongs to the retired Google-to-Guide publication pipeline; current canonical Guide writes and transactional failure semantics remain separate required tests. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


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

// Retired behavior: Google Guide synchronization is denied in all runtimes, with retired reason instead of Production-only reason; maintain zero claim/Google-call assertions. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


test("UNIT retired Guide delivery never claims or reads even when legacy flags are enabled", async () => {
  const calls=[]; const deny=name=>async()=>{calls.push(name);throw Error('Unexpected '+name)};
  const dependencies={claimGuideSync:deny('claim'),readGuideSourceContext:deny('context'),
    publishGuideProjection:deny('publish'),failGuideSync:deny('failure receipt'),readGoogleSheets:deny('Google')};
  const {canonicalReadFixture}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
  for(const env of [{...canonicalReadFixture},{...previewEnv},{...previewEnv,VERCEL_ENV:'production'}]) {
    assert.equal(guideSyncEnvironment(env).reason,'google-runtime-retired');
    assert.equal(guideWorkerServerConfiguration(env).ready,false);
    for(const triggerType of ['MANUAL','SCHEDULED']) await assert.rejects(
      ()=>synchronizeGuideContent({triggerType,requestedBy:'synthetic-director',env,dependencies}),
      error=>error.status===503 && /google-runtime-retired/.test(error.message));
  }
  assert.deepEqual(calls,[]);
});

test("API retired Guide cron and diagnostics reject before credentials or provider access", async () => {
  for(const module of [await import('../app/api/cron/guide-sync/route.js'),await import('../app/api/cron/guide-sync/diagnostics/route.js')]) {
    for(const method of ['GET','POST','PATCH','DELETE']) {
      const response=await module[method]({get headers(){assert.fail('must not read credentials')},json(){assert.fail('must not read body')}});
      assert.equal(response.status,410); assert.equal((await response.json()).code,'GOOGLE_RUNTIME_RETIRED');
    }
  }
});
