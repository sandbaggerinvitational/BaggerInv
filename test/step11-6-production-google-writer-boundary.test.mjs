import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { productionGoogleDrivePrincipalFingerprint } from
  "../lib/google-service-account-credential-context.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => readFile(path.join(root, relative), "utf8");
const legacyPrincipal = (email) =>
  productionGoogleDrivePrincipalFingerprint(email);

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

test("Runtime template has no Google writer admission and keeps canonical rehearsal disabled", async () => {
const envExample=await read('.env.example');assert.doesNotMatch(envExample,/^PRODUCTION_STEP1[12].*GOOGLE_WRITER.*=/m);assert.match(envExample,/^PRODUCTION_STEP11_SCORING_REHEARSAL_ENABLED=false$/m);assert.match(envExample,/^SCORING_AUTHORITY=supabase$/m);
});

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

test("server-only admission capabilities and generic low-level scopes have a closed import surface", async () => {
  const files = [...await javascriptFiles("app"), ...await javascriptFiles("lib")];
  const capabilityImporters = [];
  const genericIntentImporters = [];
  const prepareImporters = [];
  const canonicalCredentialLiteralFiles = [];
  const subordinateCanonicalWriterImporters = [];
  for (const relative of files) {
    if (relative === "lib/production-google-admission-capability.js") continue;
    const source = await read(relative);
    if (source.includes("production-google-admission-capability.js")) capabilityImporters.push(relative);
    if (/import\s*\{[^}]*\bwithGoogleWorkbookMutationIntent\b[^}]*\}\s*from\s*["'][^"']*google-workbook-mutation-intent\.js["']/s.test(source)) {
      genericIntentImporters.push(relative);
    }
    if (/import\s*\{[^}]*\bprepareGoogleWorkbookMutation\b[^}]*\}\s*from\s*["'][^"']*google-workbook-mutation-intent\.js["']/s.test(source)) {
      prepareImporters.push(relative);
    }
    if (/["']CANONICAL_LEGACY_V2["']/.test(source)) canonicalCredentialLiteralFiles.push(relative);
    if (/import\s*\{[^}]*(?:synchronizeNetSkinsResults|publishOfficialCalcutta)[^}]*\}\s*from\s*["'][^"']*google-sheets-write\.js["']/s.test(source)) {
      subordinateCanonicalWriterImporters.push(relative);
    }
  }
  assert.deepEqual(capabilityImporters, []);
  const ingress = await read("lib/production-cutover-scoring-ingress.js");
  const intent = await read("lib/google-workbook-mutation-intent.js");
  const capability = await read("lib/production-google-admission-capability.js");
  assert.doesNotMatch(ingress, /from\s*["']\.\/production-google-admission-capability\.js["']/);
  assert.doesNotMatch(ingress, /import\s*\(\s*["']\.\/production-google-admission-capability\.js["']\s*\)/);
  assert.match(intent, /import\s*\(\s*["']\.\/production-cutover-scoring-ingress\.js["']\s*\)/);
  assert.doesNotMatch(intent, /from\s*["']\.\/production-google-admission-capability\.js["']/);
  assert.doesNotMatch(capability, /export\s/);
  assert.doesNotMatch(capability, /registerProductionGoogleAdmissionCapability|canonicalAdmissionCapabilities/);
  assert.match(ingress, /function captureProductionGoogleAdmissionBeginMonotonic\(/);
  assert.match(ingress, /function registerProductionGoogleAdmissionCapability\(/);
  assert.match(ingress, /function revokeProductionGoogleAdmissionCapability\(/);
  assert.doesNotMatch(ingress, /export function (?:capture|register|revoke)ProductionGoogleAdmission/);
  assert.doesNotMatch(ingress,
    /export async function (?:begin|mark|report)ProductionGoogleAuthorityWrite/);
  assert.doesNotMatch(intent, /export function currentGoogleWorkbookMutationIntent/);
  assert.match(ingress,
    /PRODUCTION_SCORING_OUTCOME_BEFORE_CAPABILITY_REVOCATION_FORBIDDEN/);
  assert.match(ingress,
    /!revokedCanonicalAdmissions\.has\(admission\)[\s\S]*canonicalAdmissionCapabilities\.has\(admission\)/);
  assert.match(ingress, /performance\.now\(\)/);
  assert.match(ingress, /beginDispatchDeadline/);
  assert.match(ingress, /markDispatchDeadline/);
  assert.match(ingress, /remaining_dispatch_ms/);
  assert.doesNotMatch(ingress, /Date\.now\(\)/);
  assert.match(ingress, /productionControlPlaneFetch = globalThis\.fetch\.bind\(globalThis\)/);
  assert.match(ingress, /trustedControlPlaneDependencyBundles = new WeakSet\(\)/);
  assert.match(ingress, /function normalizeTrustedControlPlaneDependencies\(/);
  assert.match(ingress, /Object\.getOwnPropertyDescriptors\(candidate\)/);
  assert.match(ingress, /trustedControlPlaneDependencyBundles\.has\(options\)/);
  assert.match(ingress, /PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN/);
  assert.match(ingress, /NODE_TEST_CONTEXT\) === "child-v8"/);
  assert.match(ingress, /suppliedEnv !== undefined && suppliedEnv !== process\.env/);
  assert.doesNotMatch(ingress, /\.\.\.options|options\.(?:env|fetchImpl|timeoutMs)/);
  assert.match(ingress, /captureProductionGoogleAdmissionBeginMonotonic\(\)[\s\S]*productionScoringIngressRpc\(V3_RPCS\.BEGIN/);
  assert.doesNotMatch(ingress, /leaseExpiryFuture|clientNow\s*=\s*Date\.now/);
  for (const source of [ingress, intent]) {
    assert.doesNotMatch(source, /export\s+(?:\*|\{[^}]*\})\s+from\s+["'][^"']*production-google-admission-capability\.js["']/s);
  }
  assert.deepEqual(genericIntentImporters.sort(), [
    "lib/google-service-account-credential-context.js",
    "lib/production-cutover-scoring-ingress.js",
    "lib/production-google-authoring.js",
  ]);
  assert.deepEqual(prepareImporters, ["lib/google-sheets-write.js"]);
  assert.deepEqual(canonicalCredentialLiteralFiles.sort(), [
    "lib/google-service-account-credential-context.js",
    "lib/google-sheets-write.js",
    "lib/production-cutover-scoring-ingress.js",
  ]);
  assert.deepEqual(subordinateCanonicalWriterImporters, []);
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
  assert.match(cms, /function retiredProductionDraft/);
  assert.match(cms, /PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED/,
    "Production retires Draft before the retained Preview workbook intent can run");
  assert.match(cms, /ADMIN_CMS_DRAFT/);
  assert.match(cms, /ADMIN_CMS_PREDICTION_SETTINGS/);
  assert.match(guide, /TOURNAMENT_GUIDE/);
  assert.match(odds, /ODDS_PUBLICATION/);
  assert.match(passport, /PASSPORT_ROLLBACK/);
  assert.match(outbox, /SCORING_GOOGLE_OUTBOX/);
  assert.match(archive, /ROUND_SCORECARDS_ARCHIVE/);
  assert.match(oddsMirror, /ODDS_GOOGLE_MIRROR/);
  for (const source of [cms, guide, odds, passport, outbox, archive, oddsMirror]) {
    assert.doesNotMatch(source, /begin_production_scoring_ingress_v3|mark_production_scoring_ingress_write_started|report_production_scoring_ingress_outcome/);
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
  const fenceRehearsal = await read("lib/production-google-writer-fence-rehearsal.js");
  assert.doesNotMatch(fenceRehearsal, /addProtectedRange|deleteProtectedRange/);
  const guardIndex = writer.indexOf("await prepareGoogleWorkbookMutation");
  const credentialIndex = writer.indexOf("token = await accessToken", guardIndex);
  const writerStartIndex = writer.indexOf("await mutation?.prepareDispatch?.()", credentialIndex);
  const credentialBindingIndex = writer.indexOf(
    "assertProductionGoogleServiceAccountMutationBinding({",
    writerStartIndex,
  );
  const dispatchGuardIndex = writer.indexOf("mutation?.assertDispatch?.()", credentialIndex);
  const fetchIndex = writer.indexOf("responsePromise = fetch(`${target.apiBase}", guardIndex);
  assert.ok(guardIndex >= 0 && credentialIndex > guardIndex && writerStartIndex > credentialIndex &&
    credentialBindingIndex > writerStartIndex && dispatchGuardIndex > credentialBindingIndex &&
    fetchIndex > dispatchGuardIndex);
  assert.doesNotMatch(writer.slice(credentialBindingIndex, fetchIndex), /await/);
  assert.match(writer, /assertProductionGoogleServiceAccountMutationBinding/);
  assert.match(intent, /PRODUCTION_GOOGLE_MUTATION_INTENT_REQUIRED/);
  assert.match(intent, /PRODUCTION_GOOGLE_MUTATION_SHEET_REQUIRED/);
  assert.match(intent, /PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED/);
  assert.match(intent, /AUTHORING_OPERATION_SHEETS/);
  assert.match(intent, /MIRROR_ARCHIVE_OPERATION_SHEETS/);
  assert.match(intent, /PRODUCTION_CANONICAL_GOOGLE_ADMISSION_REQUIRED/);
  assert.match(writer, /mutationSheets:\s*\["Round Scorecards"\]/);
  assert.match(credential, /CANONICAL_LEGACY_V2/);
  assert.match(credential, /credentialsSeparated/);
  assert.match(credential, /google-drive-permission-principal-v1\\nuser\\n/);
  assert.match(credential, /cacheKey:\s*\{ value: `\$\{source\}:\$\{principalFingerprint\}`/);
  const ingress = await read("lib/production-cutover-scoring-ingress.js");
  assert.match(ingress, /expected_provider_principal_fingerprint/);
  assert.match(ingress, /provider_principal_fingerprint/);
  assert.match(ingress, /providerPrincipalFingerprint === state\.providerPrincipalFingerprint/);
  assert.match(ingress,
    /returnedPrincipalFingerprint === admission\.providerPrincipalFingerprint/);
});

// Retired behavior: Google private Sheets WRITE_STARTED/OAuth sequence is no longer callable in runtime; canonical audit/receipt correctness must stay separate. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Google v3 completion fence source assertion is obsolete in terminal retired route; no provider dispatch must remain behaviorally covered. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Google writer credential admission intentionally fails with runtime-retired error before callback; canonical application admission remains required separately. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Google lease BEGIN/CLOSING replay is retired writer behavior. Canonical score mutation replay/lost-response proof remains required, and must not be inferred from this classification. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Google callback dispatch revocation is retired transport behavior; no-runtime-provider-call negative test replaces it for runtime certification. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


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
    assert.equal(googleBoundary, -1, "retired Google dispatch boundary must not exist");
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
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy-writer@example.invalid", GOOGLE_PRIVATE_KEY: "legacy-writer-key",
      PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
      PRODUCTION_GOOGLE_PRIVATE_KEY: "dedicated-production-key",
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

test("Production context rejects fake control-plane fetch and environment injection before minting", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthorityWrite } from ${JSON.stringify(ingressUrl)};
    delete process.env.NODE_TEST_CONTEXT;
    let callbackCalled = false;
    let fakeFetchCalls = 0;
    let code = "";
    try {
      await withProductionGoogleAuthorityWrite(
        {},
        async () => { callbackCalled = true; },
        {
          env: { ...process.env },
          fetchImpl: async () => {
            fakeFetchCalls += 1;
            return Response.json({
              ok: true,
              contract_version: "ADMISSION_V3",
              remaining_dispatch_ms: 300_000,
            });
          },
        },
      );
    } catch (error) {
      code = error.code;
    }
    process.stdout.write(JSON.stringify({ code, callbackCalled, fakeFetchCalls }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN",
    callbackCalled: false,
    fakeFetchCalls: 0,
  });
});

test("Production context rejects accessor and Proxy dependency substitution without invoking it", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const script = `
    import { withProductionGoogleAuthorityWrite } from ${JSON.stringify(ingressUrl)};
    delete process.env.NODE_TEST_CONTEXT;
    let callbackCalled = false;
    let getterCalls = 0;
    let fakeFetchCalls = 0;
    const fakeFetch = async () => {
      fakeFetchCalls += 1;
      return Response.json({ ok: true, contract_version: "ADMISSION_V3", remaining_dispatch_ms: 300_000 });
    };
    const options = new Proxy({}, {
      ownKeys: () => ["fetchImpl"],
      getOwnPropertyDescriptor: (_target, key) => key === "fetchImpl" ? {
        configurable: true,
        enumerable: true,
        get() { getterCalls += 1; return fakeFetch; },
      } : undefined,
      get: () => {
        getterCalls += 1;
        return fakeFetch;
      },
    });
    let code = "";
    try {
      await withProductionGoogleAuthorityWrite({}, async () => { callbackCalled = true; }, options);
    } catch (error) {
      code = error.code;
    }
    process.stdout.write(JSON.stringify({ code, callbackCalled, getterCalls, fakeFetchCalls }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN",
    callbackCalled: false,
    getterCalls: 0,
    fakeFetchCalls: 0,
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

test("canonical admission mint is private and fabricated JSON, spread, and structured clones cannot dispatch", () => {
  const ingressUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const retiredCapabilityUrl = new URL("../lib/production-google-admission-capability.js", import.meta.url).href;
  const script = `
    import {
      consumeProductionGoogleAdmissionCapability,
      assertProductionGoogleAdmissionCapabilityActive,
    } from ${JSON.stringify(ingressUrl)};
    import * as retiredCapability from ${JSON.stringify(retiredCapabilityUrl)};
    const plain = {
      enabled: true,
      admissionId: "33333333-3333-4333-8333-333333333333",
      leaseId: "33333333-3333-4333-8333-333333333333",
      leaseNonce: "44444444-4444-4444-8444-444444444444",
      operationRequestId: "55555555-5555-4555-8555-555555555555",
      bound: { operation: "PARTICIPANT:SCORE" },
    };
    const variants = {
      plain,
      json: JSON.parse(JSON.stringify(plain)),
      spread: { ...plain },
      structured: structuredClone(plain),
    };
    const codes = {};
    for (const [name, admission] of Object.entries(variants)) {
      try {
        await consumeProductionGoogleAdmissionCapability(admission, {
          scope: {}, operation: "PARTICIPANT:SCORE",
        });
      } catch (error) {
        codes[name + "Consume"] = error.code;
      }
      try {
        assertProductionGoogleAdmissionCapabilityActive(admission, {
          scope: {}, operation: "PARTICIPANT:SCORE",
        });
      } catch (error) {
        codes[name + "Assert"] = error.code;
      }
    }
    process.stdout.write(JSON.stringify({
      codes,
      retiredExports: Object.keys(retiredCapability).sort(),
    }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const evidence = JSON.parse(child.stdout);
  assert.deepEqual(evidence.retiredExports, []);
  assert.deepEqual(new Set(Object.values(evidence.codes)), new Set([
    "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_REQUIRED",
  ]));
  assert.equal(Object.keys(evidence.codes).length, 8);
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
        }, async () => {
          const prepared = await prepareGoogleWorkbookMutation({
            spreadsheetId: PRODUCTION_GOOGLE_WORKBOOK_ID,
            method: "POST",
            path: "/values:batchUpdate",
            affectedSheets,
          });
          await prepared.prepareDispatch();
          return prepared;
        });
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
    // Preview still uses this bounded intent. Production Draft authoring is
    // retired at the CMS and Director mutation-authority boundaries before a
    // workbook transport can be reached.
    draft: "OK",
    settings: "OK",
    predictionSettings: "PRODUCTION_GOOGLE_MUTATION_OPERATION_NOT_ALLOWED",
    passport: "OK",
    odds: "OK",
    scoringMirror: "OK",
    archive: "OK",
    oddsMirror: "OK",
    canonical: "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_REQUIRED",
  });
});

test("retired Production Guide authoring fails before host, resource, credential, or callback dispatch", () => {
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
    results: ["PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED", "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED",
      "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED"],
  });
});

test("canonical uses the fenceable legacy identity while authoring and mirror remain dedicated", () => {
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
    process.stdout.write(JSON.stringify({ canonical: { allowed: canonical.allowed, source: canonical.credentialSource,
      usesLegacy: canonical.safety.canonicalLegacyUsesLegacyIdentity, canonical: canonical.policy.canonicalLegacy,
      mirror: canonical.policy.mirrorArchive }, authoring: { allowed: authoring.allowed, authoring: authoring.policy.directorAuthoring,
      source: authoring.credentialSource, mirror: authoring.policy.mirrorArchive },
      mirror: { allowed: mirror.allowed, source: mirror.credentialSource, mirror: mirror.policy.mirrorArchive },
      fallback: { allowed: fallback.allowed, reason: fallback.reason, legacyFallback: fallback.safety.legacyCredentialFallback } }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    canonical: { allowed: true, source: "legacy-canonical", usesLegacy: true, canonical: true, mirror: false },
    authoring: { allowed: true, authoring: true, source: "production-worker", mirror: false },
    mirror: { allowed: true, source: "production-worker", mirror: true },
    fallback: { allowed: false, reason: "production-google-credentials-required", legacyFallback: false },
  });
});

// Retired behavior: Google credential intents are retired before private key/callback handling; canonical mutation IDs/authority must remain unchanged. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Google no-write/ambiguous/partial outcome reporting is retired delivery behavior; canonical score ambiguity recovery still needs its own evidence. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


test("one uncertain provider-dispatch error produces one ambiguity diagnostic", () => {
  const intentUrl = new URL("../lib/google-workbook-mutation-intent.js", import.meta.url).href;
  const script = `
    import {
      GOOGLE_WORKBOOK_MUTATION_INTENTS,
      googleWorkbookMutationOutcome,
      markGoogleWorkbookMutationAmbiguous,
      withGoogleWorkbookMutationIntent,
    } from ${JSON.stringify(intentUrl)};
    const outcome = await withGoogleWorkbookMutationIntent({
      intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
      operation: "PARTICIPANT:SCORE",
      admission: { enabled: true, admissionId: "11111111-1111-4111-8111-111111111111" },
    }, async () => {
      const error = Object.assign(new Error("provider-dispatch outcome unknown"), {
        authorityDiagnostics: Object.freeze({ writeStartOutcomeUnknown: true }),
      });
      markGoogleWorkbookMutationAmbiguous(error);
      markGoogleWorkbookMutationAmbiguous(error);
      return googleWorkbookMutationOutcome();
    });
    process.stdout.write(JSON.stringify(outcome));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).ambiguousWrites, 1);
});

test("v3 admission failures are rendered as a refresh-required scoring pause", () => {
  const errorsUrl = new URL("../lib/scoring-api-errors.js", import.meta.url).href;
  const script = `
    import { participantScoringError, participantScoringHttpStatus, participantScoringPauseHeaders } from ${JSON.stringify(errorsUrl)};
    const codes = [
      "PRODUCTION_SCORING_ADMISSION_V3_REJECTED",
      "PRODUCTION_SCORING_ADMISSION_V3_UNAVAILABLE",
      "PRODUCTION_SCORING_ADMISSION_V3_CONTRACT_UNAVAILABLE",
    ];
    process.stdout.write(JSON.stringify(Object.fromEntries(codes.map((code) => {
      const error = Object.assign(new Error("internal admission failure"), { code });
      const headers = participantScoringPauseHeaders(error);
      return [code, { status: participantScoringHttpStatus(error), message: participantScoringError(error),
        retryAfter: headers["Retry-After"], admission: headers["X-Scoring-Admission"], action: headers["X-Scoring-Action"] }];
    }))));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const evidence = JSON.parse(child.stdout);
  assert.deepEqual(evidence.PRODUCTION_SCORING_ADMISSION_V3_REJECTED, {
    status: 409,
    message: "Scoring is temporarily paused for a verified authority transition. Refresh before trying again.",
    admission: "paused",
    action: "refresh-required",
  });
  for (const code of [
    "PRODUCTION_SCORING_ADMISSION_V3_UNAVAILABLE",
    "PRODUCTION_SCORING_ADMISSION_V3_CONTRACT_UNAVAILABLE",
  ]) {
    assert.deepEqual(evidence[code], {
      status: 503,
      message: "Scoring is temporarily paused for a verified authority transition. Refresh before trying again.",
      admission: "paused",
      action: "refresh-required",
    });
  }
});
