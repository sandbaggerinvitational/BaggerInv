import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => readFile(path.join(root, relative), "utf8");

async function javascriptFiles(directory) {
  const absolute = path.join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(relative));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const canonicalWriters = [
  "confirmLiveMatchScorecard", "disableLiveMatchAccess", "enableLiveMatchAccess",
  "finalizeLiveMatch", "generateLiveMatchAccess", "markLiveMatch", "reopenLiveMatch",
  "saveLiveHoleScore", "updateDirectorCalcutta", "updateDirectorCourseTees",
  "updateDirectorMatchManagement", "updateDirectorNetSkins", "updateDirectorRoundPairings",
  "updateLiveMatch", "updateLiveMatchPairing", "updateTournamentAdminData",
  "saveCmsRecord", "archiveCmsRecord", "deleteCmsRecord", "reorderCmsRecord",
];

const authoringWriters = [
  "activatePlayerPassport", "appendNotificationLog", "deleteTournamentGuideRecord",
  "disablePlayerPassportActivation", "generateMissingPlayerPassports", "generatePlayerPassport",
  "invalidatePushDevice", "publishOddsSnapshot", "revokePlayerPassportDevices",
  "saveTournamentGuideRecord", "updatePlayerReadiness",
];

const mirrorArchiveWriters = [
  "invalidateRoundScorecardsArchive", "mirrorCanonicalLiveMatchControl",
  "publishOddsSnapshot", "upsertRoundScorecardsArchive",
];

const previewWriters = [
  "initializePreviewParticipantIdentityConfiguration", "migratePreviewLiveMatchScoringLock",
  "normalizeLegacyReopenedMatch", "repairFinalizedLiveMatchParity", "resetPreviewTournament",
  "restorePreviewScoringBenchmarkRows",
];

const classifiedWriterSymbols = [...new Set([
  ...canonicalWriters, ...authoringWriters, ...mirrorArchiveWriters, ...previewWriters,
])];

const productionEntrypoints = new Map([
  ["lib/scoring-persistence-adapter.js", "withProductionGoogleAuthorityWrite"],
  ["app/api/director/route.js", "withProductionGoogleAuthorityWrite"],
  ["app/api/live-matches/route.js", "withProductionGoogleAuthorityWrite"],
  ["app/api/admin/tournament/route.js", "withProductionGoogleAuthorityWrite"],
  ["app/api/admin/cms/route.js", "withProductionGoogleAuthorityWrite"],
  ["app/api/tournament-guide/route.js", "withProductionGoogleAuthoringWrite"],
  ["app/api/odds/publish/route.js", "withProductionGoogleAuthoringWrite"],
  ["app/api/player-passport/activation/route.js", "withProductionGoogleAuthoringWrite"],
  ["app/api/player-passport/admin/route.js", "withProductionGoogleAuthoringWrite"],
  ["app/api/player-passport/readiness/route.js", "withProductionGoogleAuthoringWrite"],
  ["app/api/player-passport/notifications/route.js", "withProductionGoogleAuthoringWrite"],
  ["app/api/director/notifications/sandbox/route.js", "withProductionGoogleAuthoringWrite"],
  ["lib/scoring-google-outbox.js", "withProductionGoogleServiceAccountCredentials"],
  ["lib/scorecard-archive-worker.js", "withProductionGoogleServiceAccountCredentials"],
  ["lib/championship-odds-google-mirror.js", "withProductionGoogleServiceAccountCredentials"],
]);

const previewOnly = new Set([
  "app/api/director/reset-preview/route.js",
  "app/api/director/scoring-authority/route.js",
  "app/api/director/scoring-shadow/benchmark/route.js",
  "app/api/director/scoring-shadow/phase2-dry-run/route.js",
  "app/api/director/participant-identity/route.js",
]);

test("Production Google writer inventory classifies every callable workbook writer path", async () => {
  const files = [...await javascriptFiles("app"), ...await javascriptFiles("lib")];
  const allowedStringOnly = new Set([
    "app/admin/director/DirectorDashboard.js",
    "lib/director-mutation-authority.js",
    "lib/production-google-writer-inventory.js",
  ]);
  const findings = [];
  for (const relative of files) {
    if (relative === "lib/google-sheets-write.js" || allowedStringOnly.has(relative)) continue;
    const source = await read(relative);
    const symbols = classifiedWriterSymbols.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(source));
    if (!symbols.length) continue;
    if (!productionEntrypoints.has(relative) && !previewOnly.has(relative)) {
      findings.push({ relative, symbols });
      continue;
    }
    if (productionEntrypoints.has(relative)) {
      assert.match(source, new RegExp(`\\b${productionEntrypoints.get(relative)}\\b`), relative);
    } else {
      assert.match(source, /VERCEL_ENV[^\n]{0,80}preview|process\.env\.VERCEL_ENV\s*!==\s*["']preview["']/,
        `${relative} must remain hard Preview-only`);
    }
  }
  assert.deepEqual(findings, [], `Unclassified Google canonical writers: ${JSON.stringify(findings)}`);
});

test("inventory and route sources preserve distinct canonical, authoring, and mirror/archive intents", async () => {
  const [inventory, cms, guide, odds, passport, outbox, archive, oddsMirror] = await Promise.all([
    read("lib/production-google-writer-inventory.js"),
    read("app/api/admin/cms/route.js"),
    read("app/api/tournament-guide/route.js"),
    read("app/api/odds/publish/route.js"),
    read("app/api/player-passport/activation/route.js"),
    read("lib/scoring-google-outbox.js"),
    read("lib/scorecard-archive-worker.js"),
    read("lib/championship-odds-google-mirror.js"),
  ]);
  for (const intent of ["CANONICAL_LEGACY", "AUTHORING", "MIRROR_ARCHIVE"]) {
    assert.match(inventory, new RegExp(intent));
  }
  for (const symbol of classifiedWriterSymbols) assert.match(inventory, new RegExp(`\\b${symbol}\\b`), symbol);
  assert.match(cms, /ADMIN_CMS_DRAFT/);
  assert.match(cms, /ADMIN_CMS_PREDICTION_SETTINGS/);
  assert.match(guide, /TOURNAMENT_GUIDE/);
  assert.match(odds, /ODDS_PUBLICATION/);
  assert.match(passport, /PASSPORT_ROLLBACK/);
  assert.match(outbox, /SCORING_GOOGLE_OUTBOX/);
  assert.match(archive, /ROUND_SCORECARDS_ARCHIVE/);
  assert.match(oddsMirror, /ODDS_GOOGLE_MIRROR/);
  for (const source of [cms, guide, odds, passport, outbox, archive, oddsMirror]) {
    assert.doesNotMatch(source, /begin_production_scoring_ingress_v2|mark_production_scoring_ingress_write_started|report_production_scoring_ingress_outcome/);
  }
});

test("the sole low-level Sheets transport enforces intent before credentials or network", async () => {
  const [writer, intent, credential] = await Promise.all([
    read("lib/google-sheets-write.js"),
    read("lib/google-workbook-mutation-intent.js"),
    read("lib/google-service-account-credential-context.js"),
  ]);
  const directTransportFiles = [];
  for (const relative of [...await javascriptFiles("app"), ...await javascriptFiles("lib")]) {
    const source = await read(relative);
    if (source.includes("sheets.googleapis.com/v4/spreadsheets")) directTransportFiles.push(relative);
  }
  assert.deepEqual(directTransportFiles, [
    "lib/google-sheets-server-read.js",
    "lib/google-sheets-write.js",
  ]);
  const readTransport = await read("lib/google-sheets-server-read.js");
  assert.match(readTransport, /spreadsheets\.readonly/);
  const sheetsReadRequest = readTransport.slice(readTransport.indexOf("sheets.googleapis.com"));
  assert.doesNotMatch(sheetsReadRequest, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(readTransport, /prepareGoogleWorkbookMutation|confirmGoogleWorkbookMutation/);
  const guardIndex = writer.indexOf("await prepareGoogleWorkbookMutation");
  const credentialIndex = writer.indexOf("token = await accessToken", guardIndex);
  const fetchIndex = writer.indexOf("await fetch(`${target.apiBase}", guardIndex);
  assert.ok(guardIndex >= 0 && credentialIndex > guardIndex && fetchIndex > credentialIndex);
  assert.match(intent, /PRODUCTION_GOOGLE_MUTATION_INTENT_REQUIRED/);
  assert.match(intent, /PRODUCTION_GOOGLE_MUTATION_SHEET_REQUIRED/);
  assert.match(intent, /PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED/);
  assert.match(intent, /AUTHORING_OPERATION_SHEETS/);
  assert.match(intent, /MIRROR_ARCHIVE_OPERATION_SHEETS/);
  assert.match(intent, /PRODUCTION_CANONICAL_GOOGLE_ADMISSION_REQUIRED/);
  assert.match(writer, /mutationSheets:\s*\["Round Scorecards"\]/);
  assert.match(credential, /CANONICAL_LEGACY_V2/);
  assert.match(credential, /credentialsSeparated/);
});

test("v2 canonical boundary has no v1 completion-success escape", async () => {
  const [ingress, director, liveMatches, persistence] = await Promise.all([
    read("lib/production-cutover-scoring-ingress.js"),
    read("app/api/director/route.js"),
    read("app/api/live-matches/route.js"),
    read("lib/scoring-persistence-adapter.js"),
  ]);
  for (const name of [
    "inspect_production_scoring_admission",
    "begin_production_scoring_ingress_v2",
    "mark_production_scoring_ingress_write_started",
    "report_production_scoring_ingress_outcome",
  ]) assert.match(ingress, new RegExp(name));
  assert.match(ingress, /writer_intent:\s*GOOGLE_WORKBOOK_MUTATION_INTENTS\.CANONICAL_LEGACY/);
  assert.match(ingress, /PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED/);
  assert.doesNotMatch(ingress, /complete_production_scoring_ingress/);
  for (const source of [director, liveMatches, persistence]) {
    assert.match(source, /withProductionGoogleAuthorityWrite/);
    assert.doesNotMatch(source, /beginProductionGoogleAuthorityWrite|completeProductionGoogleAuthorityWrite/);
  }
});

test("v2 admission fails closed and uses the separate Production credential", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const intentUrl = new URL("../lib/google-workbook-mutation-intent.js", import.meta.url).href;
  const credentialUrl = new URL("../lib/google-service-account-credential-context.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthorityWrite } from ${JSON.stringify(ingressUrl)};
    import { certifyGoogleWorkbookMutationReadback, confirmGoogleWorkbookMutation, prepareGoogleWorkbookMutation } from ${JSON.stringify(intentUrl)};
    import { googleServiceAccountCredentialDiagnostics } from ${JSON.stringify(credentialUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const authorityGeneration = "11111111-1111-4111-8111-111111111111";
    const admissionGeneration = "22222222-2222-4222-8222-222222222222";
    const leaseId = "33333333-3333-4333-8333-333333333333";
    const commit = "a".repeat(40);
    const env = {
      VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit, VERCEL_DEPLOYMENT_ID: "dpl_12345678Test",
      PRODUCTION_FOUNDATION_ENABLED: "true", PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
      PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND", PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit,
      PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com", PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
      PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026", PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL,
      PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32), GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
      SCORING_AUTHORITY: "google", PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: authorityGeneration,
      PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: admissionGeneration,
      PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
      PRODUCTION_GOOGLE_PRIVATE_KEY: "separate-production-key",
    };
    const request = { method: "POST", url: "https://baggerinv.com/api/scoring/current", headers: new Headers({
      host: "baggerinv.com", origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https",
    }) };
    const calls = [];
    let nonce = "";
    const fetchImpl = async (url, init) => {
      const functionName = url.split("/").at(-1);
      const input = JSON.parse(init.body).input;
      calls.push({ functionName, input });
      if (functionName === "inspect_production_scoring_admission") return Response.json({ ok: true,
        activation_revision: 11, admission_revision: 7, authority_generation_id: authorityGeneration,
        admission_generation_id: admissionGeneration, deployment_id: env.VERCEL_DEPLOYMENT_ID,
        authority: "GOOGLE", admission_state: "OPEN" });
      if (functionName === "begin_production_scoring_ingress_v2") { nonce = input.lease_nonce; return Response.json({ ok: true,
        lease_id: leaseId, authority_generation_id: authorityGeneration, admission_generation_id: admissionGeneration,
        writer_intent: "CANONICAL_LEGACY", operation_request_id: input.operation_request_id, replay_usable: true }); }
      if (functionName === "mark_production_scoring_ingress_write_started") return Response.json({ ok: true, resolution_state: "WRITE_STARTED" });
      if (functionName === "report_production_scoring_ingress_outcome") return Response.json({ ok: true, resolution_state: input.outcome_state });
      return Response.json({ code: "FUNCTION_NOT_FOUND" }, { status: 404 });
    };
    const result = await withProductionGoogleAuthorityWrite({ tournamentId: "2026", matchId: "2026-R1-1",
      actorId: "CB01", operation: "PARTICIPANT:SCORE",
      operationRequestId: "44444444-4444-4444-8444-444444444444",
      scoringAuthorityContract: { version: "scoring-mutation-authority-v1", scoringAuthority: "google",
        authorityGeneration, admissionGeneration, activationRevision: 11, admissionRevision: 7,
        deploymentId: env.VERCEL_DEPLOYMENT_ID, deploymentCommit: commit }, request }, async () => {
        const credential = googleServiceAccountCredentialDiagnostics();
        await prepareGoogleWorkbookMutation({ spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID, method: "POST", path: "/values:batchUpdate", affectedSheets: ["Live Hole Scores"], env });
        confirmGoogleWorkbookMutation();
        certifyGoogleWorkbookMutationReadback({ proofType: "TEST_SCORE", before: { revision: 1 },
          expectedAfter: { revision: 2 }, providerReadback: { revision: 2 } });
        return { credentialSource: credential.credentialSource, operation: credential.operation };
      }, { env, fetchImpl });
    process.stdout.write(JSON.stringify({ result, calls, nonce }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const evidence = JSON.parse(child.stdout);
  assert.deepEqual(evidence.calls.map((item) => item.functionName), [
    "inspect_production_scoring_admission",
    "begin_production_scoring_ingress_v2",
    "mark_production_scoring_ingress_write_started",
    "report_production_scoring_ingress_outcome",
  ]);
  assert.equal(evidence.result.credentialSource, "production-worker");
  assert.equal(evidence.result.operation, "CANONICAL_LEGACY_V2");
  assert.equal(evidence.calls[1].input.writer_intent, "CANONICAL_LEGACY");
  assert.equal(evidence.calls[2].input.lease_nonce, evidence.nonce);
  assert.equal(evidence.calls[3].input.outcome_state, "CONFIRMED_WRITE");
  assert.match(evidence.calls[3].input.provider_before_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(evidence.calls[3].input.provider_after_fingerprint,
    evidence.calls[3].input.provider_readback_fingerprint);
  assert.match(evidence.calls[3].input.outcome_evidence_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal("external_fence_evidence_id" in evidence.calls[1].input, false);
});

test("lost BEGIN response replays the exact OPEN payload during CLOSING without a second lease", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthorityWrite } from ${JSON.stringify(ingressUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const authorityGeneration = "11111111-1111-4111-8111-111111111111";
    const admissionGeneration = "22222222-2222-4222-8222-222222222222";
    const operationRequestId = "66666666-6666-4666-8666-666666666666";
    const leaseId = "77777777-7777-4777-8777-777777777777";
    const commit = "a".repeat(40);
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit, VERCEL_DEPLOYMENT_ID: "dpl_12345678Test", PRODUCTION_FOUNDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true", PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
      PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit, PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com", PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026", PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, SCORING_AUTHORITY: "google", PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: authorityGeneration, PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: admissionGeneration,
      PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
      PRODUCTION_GOOGLE_PRIVATE_KEY: "separate-production-key" };
    const request = { method: "POST", url: "https://baggerinv.com/api/director", headers: new Headers({ host: "baggerinv.com",
      origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https" }) };
    const scoringAuthorityContract = { version: "scoring-mutation-authority-v1", scoringAuthority: "google",
      authorityGeneration, admissionGeneration, activationRevision: 11, admissionRevision: 7,
      deploymentId: env.VERCEL_DEPLOYMENT_ID, deploymentCommit: commit };
    const base = { tournamentId: "2026", matchId: "2026-R1-1", actorId: "CB01", operation: "DIRECTOR:MARK-LIVE",
      operationRequestId, scoringAuthorityContract, request };
    let phase = "OPEN";
    let beginAttempts = 0;
    let callbackCount = 0;
    let firstBegin = null;
    let replayBegin = null;
    let replayUsable = true;
    let conflict = false;
    const fetchImpl = async (url, init) => {
      const name = url.split("/").at(-1); const input = JSON.parse(init.body).input;
      if (name === "inspect_production_scoring_admission") return Response.json({ ok: true,
        activation_revision: phase === "OPEN" ? 11 : 12, admission_revision: phase === "OPEN" ? 7 : 8,
        authority_generation_id: authorityGeneration, admission_generation_id: admissionGeneration,
        deployment_id: env.VERCEL_DEPLOYMENT_ID, authority: "GOOGLE", admission_state: phase });
      if (name === "begin_production_scoring_ingress_v2") {
        beginAttempts += 1;
        if (conflict) return Response.json({ code: "PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT" }, { status: 409 });
        if (beginAttempts === 1) { firstBegin = input; throw new Error("BEGIN response lost after commit"); }
        replayBegin = input;
        return Response.json({ ok: true, lease_id: leaseId, authority_generation_id: authorityGeneration,
          admission_generation_id: admissionGeneration, writer_intent: "CANONICAL_LEGACY",
          operation_request_id: operationRequestId, replay_usable: replayUsable, idempotent: true,
          lease_nonce_rotated: replayUsable });
      }
      if (name === "mark_production_scoring_ingress_write_started") return Response.json({ ok: true });
      if (name === "report_production_scoring_ingress_outcome") return Response.json({ ok: true, resolution_state: input.outcome_state });
      return Response.json({}, { status: 404 });
    };
    const errors = [];
    try { await withProductionGoogleAuthorityWrite(base, async () => { callbackCount += 1; }, { env, fetchImpl }); }
    catch (error) { errors.push(error.code); }
    phase = "CLOSING";
    const recovered = await withProductionGoogleAuthorityWrite(base, async () => { callbackCount += 1; return "recovered"; }, { env, fetchImpl });
    replayUsable = false;
    try { await withProductionGoogleAuthorityWrite(base, async () => { callbackCount += 1; }, { env, fetchImpl }); }
    catch (error) { errors.push(error.code); }
    replayUsable = true;
    conflict = true;
    try { await withProductionGoogleAuthorityWrite({ ...base, operation: "DIRECTOR:DIFFERENT" }, async () => { callbackCount += 1; }, { env, fetchImpl }); }
    catch (error) { errors.push(error.code); }
    process.stdout.write(JSON.stringify({ errors, recovered, callbackCount, beginAttempts,
      sameLeasePayload: firstBegin.request_fingerprint === replayBegin.request_fingerprint,
      nonceRotated: firstBegin.lease_nonce !== replayBegin.lease_nonce,
      replayActivationRevision: replayBegin.expected_activation_revision,
      replayAdmissionRevision: replayBegin.expected_admission_revision,
      operationRequestId: replayBegin.operation_request_id }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    errors: [
      "PRODUCTION_SCORING_ADMISSION_CONTROL_PLANE_UNAVAILABLE",
      "PRODUCTION_SCORING_ADMISSION_V2_REJECTED",
      "PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT",
    ],
    recovered: "recovered",
    callbackCount: 1,
    beginAttempts: 4,
    sameLeasePayload: true,
    nonceRotated: true,
    replayActivationRevision: 11,
    replayAdmissionRevision: 7,
    operationRequestId: "66666666-6666-4666-8666-666666666666",
  });
});

test("a Google-era Director mutation is rejected after Supabase commit before either writer", () => {
  const contractUrl = new URL("../lib/scoring-mutation-authority-server.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { assertCurrentScoringMutationAuthorityContract } from ${JSON.stringify(contractUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const currentGeneration = "33333333-3333-4333-8333-333333333333";
    const admissionGeneration = "22222222-2222-4222-8222-222222222222";
    const commit = "a".repeat(40);
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit, VERCEL_DEPLOYMENT_ID: "dpl_12345678Test", PRODUCTION_FOUNDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true", PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
      PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true", PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit, PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com", PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026", PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, SCORING_AUTHORITY: "supabase", PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: currentGeneration, PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: admissionGeneration };
    const request = { method: "POST", url: "https://baggerinv.com/api/director", headers: new Headers({ host: "baggerinv.com",
      origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https" }) };
    const staleGoogleContract = { version: "scoring-mutation-authority-v1", scoringAuthority: "google",
      authorityGeneration: "11111111-1111-4111-8111-111111111111", admissionGeneration,
      activationRevision: 11, admissionRevision: 7, deploymentId: env.VERCEL_DEPLOYMENT_ID, deploymentCommit: commit };
    let googleWrites = 0; let supabaseWrites = 0; let code = "";
    const fetchImpl = async () => Response.json({ ok: true, activation_revision: 12, admission_revision: 8,
      authority_generation_id: currentGeneration, admission_generation_id: admissionGeneration,
      deployment_id: env.VERCEL_DEPLOYMENT_ID, authority: "SUPABASE", admission_state: "CLOSED",
      execution_gate: "OPEN", scoring_ingress_enabled: true });
    try {
      await assertCurrentScoringMutationAuthorityContract(staleGoogleContract, { request, env, fetchImpl });
      googleWrites += 1;
      supabaseWrites += 1;
    } catch (error) { code = error.code; }
    process.stdout.write(JSON.stringify({ code, googleWrites, supabaseWrites }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "SCORING_AUTHORITY_CONTRACT_STALE",
    googleWrites: 0,
    supabaseWrites: 0,
  });
});

test("Director and Live Match routes assert the client authority contract before branching to either backend", async () => {
  const [director, liveMatches] = await Promise.all([
    read("app/api/director/route.js"),
    read("app/api/live-matches/route.js"),
  ]);
  for (const source of [director, liveMatches]) {
    const assertion = source.indexOf("await assertScoringMutationAuthorityContractBeforeDispatch(");
    const supabaseBranch = source.indexOf('mutationAuthority.resolvedAuthority === "supabase"');
    const googleBoundary = source.indexOf("withProductionGoogleAuthorityWrite({", assertion);
    assert.ok(assertion >= 0, "route must assert the client-bound authority contract");
    assert.ok(assertion < supabaseBranch, "authority contract must precede the Supabase branch");
    assert.ok(assertion < googleBoundary, "authority contract must precede the Google boundary");
  }
});

test("browser mutation clients preserve one stable operation ID and their loaded authority contract", async () => {
  const [director, liveMatches, tournament, cms, scoreEntry] = await Promise.all([
    read("app/admin/director/DirectorDashboard.js"),
    read("app/admin/live-matches/LiveMatchControl.js"),
    read("app/admin/TournamentEditor.js"),
    read("app/admin/CmsManager.js"),
    read("app/score/ScoreEntry.js"),
  ]);
  assert.match(director, /priorAttempt\?\.receipt \|\| mutationIdentityRegistry\(\)\.acquire/);
  assert.match(director, /setRetryOperation\(\(\) => mutationConfirmed \? \(\) => load\(\) : \(\) => act\(action, extra, attempt\)\)/);
  for (const source of [director, liveMatches, tournament, cms]) {
    assert.match(source, /createClientMutationOperationIdentityRegistry/);
    assert.match(source, /mutationIdentityRegistry\(\)\.acquire/);
    assert.match(source, /mutationIdentityRegistry\(\)\.confirm/);
    assert.match(source, /operationRequestId/);
    assert.match(source, /scoringAuthorityContract/);
  }
  assert.match(scoreEntry, /createClientMutationOperationIdentityRegistry/);
  assert.match(scoreEntry, /mutationIdentityRegistry\(\)\.acquire/);
  assert.match(scoreEntry, /mutationIdentityRegistry\(\)\.confirm/);
  assert.match(scoreEntry, /operationRequestId: entry\.operationRequestId/);
  assert.match(scoreEntry, /scoringAuthorityContract: entry\.scoringAuthorityContract/);
  assert.match(scoreEntry, /scoringMutationAuthorityContractFromData\(data\)/);
});

test("control-plane loss prevents the callback and no legacy fallback executes", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthorityWrite } from ${JSON.stringify(ingressUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const commit = "a".repeat(40);
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit, VERCEL_DEPLOYMENT_ID: "dpl_12345678Test", PRODUCTION_FOUNDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true", PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
      PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit, PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com", PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026", PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, SCORING_AUTHORITY: "google", PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "11111111-1111-4111-8111-111111111111",
      PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: "22222222-2222-4222-8222-222222222222" };
    const request = { method: "POST", url: "https://baggerinv.com/api/scoring/current", headers: new Headers({ host: "baggerinv.com",
      origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https" }) };
    let callbackCalled = false;
    try {
      await withProductionGoogleAuthorityWrite({ tournamentId: "2026", matchId: "2026-R1-1", actorId: "CB01",
        operation: "PARTICIPANT:SCORE", request }, async () => { callbackCalled = true; },
        { env, fetchImpl: async () => { throw new Error("offline"); } });
    } catch (error) {
      process.stdout.write(JSON.stringify({ callbackCalled, code: error.code }));
    }
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    callbackCalled: false,
    code: "PRODUCTION_SCORING_ADMISSION_CONTROL_PLANE_UNAVAILABLE",
  });
});

test("low-level Production writes reject absent intent and canonical admission before provider access", () => {
  const intentUrl = new URL("../lib/google-workbook-mutation-intent.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const script = `
    import { GOOGLE_WORKBOOK_MUTATION_INTENTS, prepareGoogleWorkbookMutation, withGoogleWorkbookMutationIntent } from ${JSON.stringify(intentUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID } from ${JSON.stringify(foundationUrl)};
    const attempt = () => prepareGoogleWorkbookMutation({ spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      method: "POST", path: "/values:batchUpdate", affectedSheets: ["Live Hole Scores"] });
    const codes = [];
    try { await attempt(); } catch (error) { codes.push(error.code); }
    try { await withGoogleWorkbookMutationIntent({ intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
      operation: "PARTICIPANT:SCORE" }, attempt); } catch (error) { codes.push(error.code); }
    try { await prepareGoogleWorkbookMutation({ spreadsheetId: "preview-workbook", method: "POST",
      path: "/values:batchUpdate", env: { VERCEL_ENV: "production" } }); } catch (error) { codes.push(error.code); }
    process.stdout.write(JSON.stringify(codes));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [
    "PRODUCTION_GOOGLE_MUTATION_INTENT_REQUIRED",
    "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_REQUIRED",
    "PRODUCTION_GOOGLE_WORKBOOK_RESOURCE_MISMATCH",
  ]);
});

test("low-level Production transport binds each mutation intent and operation to approved sheets", () => {
  const intentUrl = new URL("../lib/google-workbook-mutation-intent.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const script = `
    import {
      GOOGLE_AUTHORING_OPERATIONS,
      GOOGLE_WORKBOOK_MUTATION_INTENTS,
      prepareGoogleWorkbookMutation,
      withGoogleWorkbookMutationIntent,
    } from ${JSON.stringify(intentUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID } from ${JSON.stringify(foundationUrl)};
    const validAdmission = { enabled: true, admissionId: "11111111-1111-4111-8111-111111111111" };
    async function attempt(intent, operation, affectedSheets, canonical = false) {
      try {
        await withGoogleWorkbookMutationIntent({
          intent,
          operation,
          ...(canonical ? { admission: validAdmission, beforeFirstWrite: async () => ({ ok: true }) } : {}),
        }, () => prepareGoogleWorkbookMutation({
          spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID,
          method: "POST",
          path: "/values:batchUpdate",
          affectedSheets,
        }));
        return "OK";
      } catch (error) {
        return error.code;
      }
    }
    const A = GOOGLE_WORKBOOK_MUTATION_INTENTS.AUTHORING;
    const M = GOOGLE_WORKBOOK_MUTATION_INTENTS.MIRROR_ARCHIVE;
    const C = GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY;
    const results = {
      authoringToCanonical: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE, ["Live Hole Scores"]),
      oddsToGuide: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.ODDS_PUBLICATION, ["Guide Sections"]),
      archiveToCanonical: await attempt(M, "ROUND_SCORECARDS_ARCHIVE", ["Live Matches"]),
      mirrorToAuthoring: await attempt(M, "SCORING_GOOGLE_OUTBOX", ["Draft Settings"]),
      canonicalToAuthoring: await attempt(C, "PARTICIPANT:SCORE", ["Draft Settings"], true),
      empty: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_DRAFT, []),
      unknown: await attempt(M, "UNKNOWN_MIRROR", ["Round Scorecards"]),
      guide: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE,
        ["Guide Sections", "Rule Book", "Tournament Itinerary", "Guide Information", "Admin Audit Log"]),
      draft: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_DRAFT,
        ["Draft Settings", "Draft Picks", "Admin Audit Log"]),
      settings: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_PRESENTATION,
        ["Media Library", "Site Settings", "Admin Audit Log"]),
      predictionSettings: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_PREDICTION_SETTINGS,
        ["Prediction Settings", "Admin Audit Log"]),
      passport: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK,
        ["Player Passport", "Trusted Devices", "Notification Log", "Admin Audit Log"]),
      odds: await attempt(A, GOOGLE_AUTHORING_OPERATIONS.ODDS_PUBLICATION,
        ["Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results"]),
      scoringMirror: await attempt(M, "SCORING_GOOGLE_OUTBOX",
        ["Live Hole Scores", "Live Matches", "Matches", "Match Update Log", "Admin Audit Log"]),
      archive: await attempt(M, "ROUND_SCORECARDS_ARCHIVE", ["Round Scorecards"]),
      oddsMirror: await attempt(M, "ODDS_GOOGLE_MIRROR",
        ["Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results"]),
      canonical: await attempt(C, "PARTICIPANT:SCORE",
        ["Live Hole Scores", "Live Matches", "Match Update Log"], true),
    };
    process.stdout.write(JSON.stringify(results));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    authoringToCanonical: "PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED",
    oddsToGuide: "PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED",
    archiveToCanonical: "PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED",
    mirrorToAuthoring: "PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED",
    canonicalToAuthoring: "PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED",
    empty: "PRODUCTION_GOOGLE_MUTATION_SHEET_REQUIRED",
    unknown: "PRODUCTION_GOOGLE_MUTATION_OPERATION_NOT_ALLOWED",
    guide: "OK",
    draft: "OK",
    settings: "OK",
    predictionSettings: "OK",
    passport: "OK",
    odds: "OK",
    scoringMirror: "OK",
    archive: "OK",
    oddsMirror: "OK",
    canonical: "OK",
  });
});

test("noncanonical and direct-deployment hosts fail before authoring selects a credential", () => {
  const authoringUrl = new URL("../lib/production-google-authoring.js", import.meta.url).href;
  const intentUrl = new URL("../lib/google-workbook-mutation-intent.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthoringWrite } from ${JSON.stringify(authoringUrl)};
    import { GOOGLE_AUTHORING_OPERATIONS } from ${JSON.stringify(intentUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const commit = "a".repeat(40);
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit, PRODUCTION_FOUNDATION_ENABLED: "true", PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
      PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND", PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit,
      PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID, PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
      PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026", PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL:
        "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com", PRODUCTION_GOOGLE_PRIVATE_KEY: "separate-key" };
    let callbacks = 0;
    const hosts = ["evil.example", "bagger-inv.vercel.app"];
    const results = [];
    for (const host of hosts) {
      const request = { method: "POST", url: "https://" + host + "/api/tournament-guide", headers: new Headers({
        host, origin: "https://" + host, "x-forwarded-host": host, "x-forwarded-proto": "https" }) };
      try { await withProductionGoogleAuthoringWrite({ request, operation: GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE, env },
        async () => { callbacks += 1; }); } catch (error) { results.push(error.code); }
    }
    const productionRequest = { method: "POST", url: "https://baggerinv.com/api/tournament-guide", headers: new Headers({
      host: "baggerinv.com", origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https" }) };
    try { await withProductionGoogleAuthoringWrite({ request: productionRequest,
      operation: GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE, env: { ...env, GOOGLE_SHEETS_ID: "preview-workbook" } },
      async () => { callbacks += 1; }); } catch (error) { results.push(error.code); }
    process.stdout.write(JSON.stringify({ callbacks, results }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    callbacks: 0,
    results: ["PRODUCTION_CUTOVER_REQUEST_UNAVAILABLE", "PRODUCTION_CUTOVER_REQUEST_UNAVAILABLE",
      "PRODUCTION_GOOGLE_AUTHORING_RESOURCE_MISMATCH"],
  });
});

test("canonical, authoring, and mirror policies are distinct and never fall back to legacy credentials", () => {
  const credentialUrl = new URL("../lib/google-service-account-credential-context.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { productionGoogleCredentialEnvironment } from ${JSON.stringify(credentialUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const resources = { supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF, supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
      googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID, tournamentId: "2026", tournamentYear: 2026,
      vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID, vercelProjectName: "bagger-inv", canonicalHostname: "baggerinv.com" };
    const base = { VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_FOUNDATION_ENABLED: "true", PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL,
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, VERCEL_DEPLOYMENT_ID: "dpl_12345678Test", SCORING_AUTHORITY: "google",
      PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "11111111-1111-4111-8111-111111111111",
      PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: "22222222-2222-4222-8222-222222222222",
      PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
      PRODUCTION_GOOGLE_PRIVATE_KEY: "dedicated-key", GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy-v0@example.invalid", GOOGLE_PRIVATE_KEY: "legacy-key" };
    const canonical = productionGoogleCredentialEnvironment({ env: base, operation: "CANONICAL_LEGACY_V2", resources });
    const authoring = productionGoogleCredentialEnvironment({ env: base, operation: "GOOGLE_DIRECTOR_AUTHORING", resources });
    const mirror = productionGoogleCredentialEnvironment({ env: { ...base, SCORING_AUTHORITY: "supabase",
      SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true" },
      operation: "SCORING_GOOGLE_OUTBOX", resources });
    const fallback = productionGoogleCredentialEnvironment({ env: { ...base, PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
      PRODUCTION_GOOGLE_PRIVATE_KEY: "" }, operation: "GOOGLE_DIRECTOR_AUTHORING", resources });
    process.stdout.write(JSON.stringify({ canonical: { allowed: canonical.allowed, canonical: canonical.policy.canonicalLegacy,
      mirror: canonical.policy.mirrorArchive }, authoring: { allowed: authoring.allowed, authoring: authoring.policy.directorAuthoring,
      mirror: authoring.policy.mirrorArchive }, mirror: { allowed: mirror.allowed, mirror: mirror.policy.mirrorArchive },
      fallback: { allowed: fallback.allowed, reason: fallback.reason, legacyFallback: fallback.safety.legacyCredentialFallback } }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    canonical: { allowed: true, canonical: true, mirror: false },
    authoring: { allowed: true, authoring: true, mirror: false },
    mirror: { allowed: true, mirror: true },
    fallback: { allowed: false, reason: "production-google-credentials-required", legacyFallback: false },
  });
});

test("v2 reports no-write, ambiguous, and partial outcomes without a finally-success path", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const intentUrl = new URL("../lib/google-workbook-mutation-intent.js", import.meta.url).href;
  const foundationUrl = new URL("../lib/production-foundation-resource-contract.js", import.meta.url).href;
  const activationUrl = new URL("../lib/production-cutover-activation-contract.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthorityWrite } from ${JSON.stringify(ingressUrl)};
    import { confirmGoogleWorkbookMutation, markGoogleWorkbookMutationAmbiguous, prepareGoogleWorkbookMutation } from ${JSON.stringify(intentUrl)};
    import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from ${JSON.stringify(foundationUrl)};
    import { PRODUCTION_VERCEL_PROJECT_ID } from ${JSON.stringify(activationUrl)};
    const authorityGeneration = "11111111-1111-4111-8111-111111111111";
    const admissionGeneration = "22222222-2222-4222-8222-222222222222";
    const commit = "a".repeat(40);
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_NAME: "bagger-inv", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit, VERCEL_DEPLOYMENT_ID: "dpl_12345678Test", PRODUCTION_FOUNDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true", PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
      PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit, PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com", PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026", PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, SCORING_AUTHORITY: "google", PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: authorityGeneration, PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: admissionGeneration,
      PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
      PRODUCTION_GOOGLE_PRIVATE_KEY: "separate-production-key" };
    const request = { method: "POST", url: "https://baggerinv.com/api/scoring/current", headers: new Headers({ host: "baggerinv.com",
      origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https" }) };
    let sequence = 0;
    const reports = [];
    const rpcCounts = {};
    const modeByRequestId = new Map();
    const fetchImpl = async (url, init) => {
      const name = url.split("/").at(-1); const input = JSON.parse(init.body).input;
      const mode = modeByRequestId.get(input.operation_request_id) || input.operation || "INSPECT";
      const countKey = mode + ":" + name;
      rpcCounts[countKey] = Number(rpcCounts[countKey] || 0) + 1;
      if (name === "inspect_production_scoring_admission") return Response.json({ ok: true, activation_revision: 11,
        admission_revision: 7, authority_generation_id: authorityGeneration, admission_generation_id: admissionGeneration,
        deployment_id: env.VERCEL_DEPLOYMENT_ID, authority: "GOOGLE", admission_state: "OPEN" });
      if (name === "begin_production_scoring_ingress_v2") return Response.json({ ok: true,
        lease_id: "33333333-3333-4333-8333-" + String(++sequence).padStart(12, "0"), authority_generation_id: authorityGeneration,
        admission_generation_id: admissionGeneration, writer_intent: "CANONICAL_LEGACY",
        operation_request_id: input.operation_request_id, replay_usable: true });
      if (name === "mark_production_scoring_ingress_write_started") {
        if (mode === "TEST:MARK_LOST") throw new Error("response lost after server boundary");
        if (mode === "TEST:EXPIRED") return Response.json({ ok: false, resolution_state: "AMBIGUOUS",
          code: "PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS" });
        return Response.json({ ok: true, resolution_state: "WRITE_STARTED" });
      }
      if (name === "report_production_scoring_ingress_outcome") {
        reports.push(input);
        if (["TEST:MARK_LOST", "TEST:EXPIRED"].includes(mode)) return Response.json({
          code: "PRODUCTION_SCORING_NO_WRITE_RECONCILIATION_REQUIRED",
        }, { status: 409 });
        return Response.json({ ok: true, resolution_state: input.outcome_state });
      }
      return Response.json({}, { status: 404 });
    };
    let operationSequence = 0;
    const operationInput = (mode) => {
      const operationRequestId = "55555555-5555-4555-8555-" + String(++operationSequence).padStart(12, "0");
      modeByRequestId.set(operationRequestId, mode);
      return { tournamentId: "2026", matchId: "2026-R1-1", actorId: "CB01", request,
        operation: "PARTICIPANT:SCORE", operationRequestId,
        scoringAuthorityContract: { version: "scoring-mutation-authority-v1", scoringAuthority: "google",
          authorityGeneration, admissionGeneration, activationRevision: 11, admissionRevision: 7,
          deploymentId: env.VERCEL_DEPLOYMENT_ID, deploymentCommit: commit } };
    };
    const outcomes = [];
    outcomes.push(await withProductionGoogleAuthorityWrite(operationInput("TEST:NO_WRITE"), async () => "no-write", { env, fetchImpl }));
    for (const mode of ["NO_READBACK", "AMBIGUOUS", "PARTIAL"]) {
      try {
        await withProductionGoogleAuthorityWrite(operationInput("TEST:" + mode), async () => {
          await prepareGoogleWorkbookMutation({ spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID, method: "POST",
            path: "/values:batchUpdate", affectedSheets: ["Live Hole Scores"] });
          if (mode === "AMBIGUOUS") markGoogleWorkbookMutationAmbiguous();
          else confirmGoogleWorkbookMutation();
          if (mode === "PARTIAL") throw Object.assign(new Error("after-write failure"), { code: "TEST_AFTER_WRITE_FAILURE" });
          return "unsafe-success";
        }, { env, fetchImpl });
      } catch (error) { outcomes.push(error.code); }
    }
    for (const mode of ["MARK_LOST", "EXPIRED"]) {
      try {
        await withProductionGoogleAuthorityWrite(operationInput("TEST:" + mode), async () => {
          await prepareGoogleWorkbookMutation({ spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID, method: "POST",
            path: "/values:batchUpdate", affectedSheets: ["Live Hole Scores"] });
          throw new Error("provider must remain unreachable");
        }, { env, fetchImpl });
      } catch (error) { outcomes.push(error.code); }
    }
    process.stdout.write(JSON.stringify({ outcomes, rpcCounts, reports: reports.map((input) => ({ outcome: input.outcome_state,
      actor: input.actor_id, before: input.provider_before_fingerprint, after: input.provider_after_fingerprint,
      readback: input.provider_readback_fingerprint })) }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const evidence = JSON.parse(child.stdout);
  assert.deepEqual(evidence.outcomes, [
    "no-write",
    "PRODUCTION_SCORING_WRITE_AMBIGUOUS_RECONCILIATION_REQUIRED",
    "PRODUCTION_SCORING_WRITE_AMBIGUOUS_RECONCILIATION_REQUIRED",
    "PRODUCTION_SCORING_PARTIAL_WRITE_RECONCILIATION_REQUIRED",
    "PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED",
    "PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED",
  ]);
  assert.deepEqual(evidence.reports.map((item) => item.outcome), [
    "PROVEN_NO_WRITE", "AMBIGUOUS", "AMBIGUOUS", "PARTIAL_WRITE", "PROVEN_NO_WRITE", "PROVEN_NO_WRITE",
  ]);
  assert.equal(evidence.rpcCounts["TEST:MARK_LOST:mark_production_scoring_ingress_write_started"], 1);
  assert.equal(evidence.rpcCounts["TEST:EXPIRED:mark_production_scoring_ingress_write_started"], 1);
  assert.ok(evidence.reports.every((item) => item.actor === "CB01"));
  for (const item of evidence.reports.slice(1)) {
    assert.equal(item.before, "");
    assert.equal(item.after, "");
    assert.equal(item.readback, "");
  }
});

test("stale admission errors are rendered as a refresh-required scoring pause", () => {
  const errorsUrl = new URL("../lib/scoring-api-errors.js", import.meta.url).href;
  const script = `
    import { participantScoringError, participantScoringHttpStatus, participantScoringPauseHeaders } from ${JSON.stringify(errorsUrl)};
    const error = Object.assign(new Error("internal mismatch"), { code: "PRODUCTION_SCORING_ADMISSION_INSPECTION_MISMATCH" });
    const headers = participantScoringPauseHeaders(error);
    process.stdout.write(JSON.stringify({ status: participantScoringHttpStatus(error), message: participantScoringError(error),
      retryAfter: headers["Retry-After"], admission: headers["X-Scoring-Admission"], action: headers["X-Scoring-Action"] }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    status: 409,
    message: "Scoring is temporarily paused for a verified authority transition. Refresh before trying again.",
    admission: "paused",
    action: "refresh-required",
  });
});
