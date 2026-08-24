import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertParticipantIdentityAdministrativeEnvironment,
  participantIdentityAuthorityEnvironment,
} from "../lib/participant-identity-authority.js";
import { authorizePreviewDirector } from "../lib/preview-director-authorization.js";
import {
  classifyParticipantEmailOtpAuthError,
  participantAuthClientRequestHash,
} from "../lib/participant-auth-rehearsal.js";
import {
  participantAuthCaptchaConfigured,
  participantAuthExperienceConfiguration,
} from "../lib/participant-sms-auth-feature.js";
import {
  productionAuthRecoveryReference,
  recordOtpVerificationWithRecovery,
} from "../lib/participant-auth-certification-recovery.js";
import {
  ParticipantIdentityResolutionError,
  resolveSupabaseParticipantIdentity,
} from "../lib/participant-identity-resolver.js";
import { productionAuthPreprovisionEvidence } from "../lib/production-auth-preprovision-contract.js";
import {
  assertProductionShadowCandidate,
  assertProductionShadowCandidateRequest,
  productionShadowCandidateEnvironment,
} from "../lib/production-shadow-candidate.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const candidateHostname = "bagger-production-shadow-example.vercel.app";
const deploymentHostname = "bagger-production-shadow-deploy.vercel.app";
const candidateCommit = "a".repeat(40);

function splitSqlTopLevel(input) {
  const values = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "'" && quoted && input[index + 1] === "'") {
      current += "''";
      index += 1;
      continue;
    }
    if (character === "'") quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && character === "," && depth === 0) {
      values.push(current.trim());
      current = "";
    } else current += character;
  }
  values.push(current.trim());
  return values;
}
const candidateEnv = {
  VERCEL_ENV: "preview",
  VERCEL_URL: deploymentHostname,
  VERCEL_BRANCH_URL: candidateHostname,
  VERCEL_GIT_COMMIT_SHA: candidateCommit,
  VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: candidateHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: candidateCommit,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "production-server-secret-never-serialized",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-browser-publishable-key",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "production-auth-rate-limit-only-secret",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
};

test("exact Production-shadow candidate tuple enables Supabase Auth without selecting live Production", () => {
  const state = assertProductionShadowCandidate(candidateEnv);
  assert.equal(state.contractVersion, "production-shadow-candidate-v1");
  assert.equal(state.allowed, true);
  assert.deepEqual(state.resources, {
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseHost: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
    sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    candidateHostname,
    deploymentHostname,
    commitSha: candidateCommit,
    vercelProjectId: "prj_bagger_inv_production",
    vercelProjectName: "bagger-inv",
  });
  assert.deepEqual(state.safety, {
    liveProductionSelected: false,
    scoringAuthority: "google",
    scoringIngressEnabled: false,
    googleMirrorDeliveryEnabled: false,
    oddsPublicationEnabled: false,
    publicApplicationReadCutover: false,
    authUserCreationEnabled: false,
  });
  assert.doesNotMatch(JSON.stringify(state), /production-server-secret-never-serialized/);

  const identity = participantIdentityAuthorityEnvironment(candidateEnv);
  assert.equal(identity.resolved, "supabase");
  assert.equal(identity.productionShadowCandidate, true);
  assert.equal(identity.participantAuthEnabled, true);
  assert.equal(identity.previewWorkbook, false);
  assert.equal(identity.authRehearsalEnabled, false);
});

test("candidate fails closed on hostname, resource, CAPTCHA, or authority drift", () => {
  const cases = [
    [{ ...candidateEnv, VERCEL_BRANCH_URL: "another.vercel.app" }, "stable-branch-hostname-required"],
    [{ ...candidateEnv, PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: "baggerinv.com", VERCEL_BRANCH_URL: "baggerinv.com" }, "stable-branch-hostname-required"],
    [{ ...candidateEnv, VERCEL_GIT_COMMIT_SHA: "b".repeat(40) }, "exact-candidate-commit-required"],
    [{ ...candidateEnv, VERCEL_PROJECT_ID: "prj_wrong" }, "exact-vercel-project-required"],
    [{ ...candidateEnv, PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" }, "production-project-ref-required"],
    [{ ...candidateEnv, NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" }, "production-public-auth-url-required"],
    [{ ...candidateEnv, GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" }, "production-workbook-required"],
    [{ ...candidateEnv, PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "false" }, "captcha-configuration-required"],
    [{ ...candidateEnv, PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "short" }, "auth-rate-limit-secret-required"],
    [{ ...candidateEnv, SCORING_AUTHORITY: "supabase" }, "google-scoring-authority-required"],
    [{ ...candidateEnv, PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true" }, "authoritative-feature-forbidden"],
  ];
  for (const [env, reason] of cases) {
    const candidate = productionShadowCandidateEnvironment(env);
    assert.equal(candidate.allowed, false, reason);
    assert.equal(candidate.reason, reason);
    const identity = participantIdentityAuthorityEnvironment(env);
    assert.equal(identity.resolved, "unavailable", reason);
    assert.equal(identity.blocked, true, reason);
  }
});

test("candidate requests are bound to the stable alias and same origin", () => {
  const request = (host, { origin = `https://${host}`, method = "POST" } = {}) => ({
    method,
    url: `https://${host}/api/participant/auth/otp/request`,
    headers: new Headers({ host, "x-forwarded-host": host, "x-forwarded-proto": "https", ...(origin ? { origin } : {}) }),
  });
  assert.equal(assertProductionShadowCandidateRequest(request(candidateHostname), candidateEnv).allowed, true);
  assert.throws(
    () => assertProductionShadowCandidateRequest(request(deploymentHostname), candidateEnv),
    (error) => error.code === "PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE" &&
      error.diagnostics.reason === "exact-request-host-required",
  );
  assert.throws(
    () => assertProductionShadowCandidateRequest(request("baggerinv.com"), candidateEnv),
    (error) => error.diagnostics.reason === "exact-request-host-required",
  );
  assert.throws(
    () => assertProductionShadowCandidateRequest(request(candidateHostname, { origin: "https://baggerinv.com" }), candidateEnv),
    (error) => error.diagnostics.reason === "exact-request-origin-required",
  );
  assert.equal(assertProductionShadowCandidateRequest(
    request(candidateHostname, { origin: "", method: "GET" }), candidateEnv, { requireOrigin: false },
  ).allowed, true);
});

test("Production-shadow Auth page and optional diagnostics stay on the exact candidate boundary", async () => {
  const [page, diagnosticsRoute] = await Promise.all([
    readFile(new URL("../app/participant-auth/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/participant/auth/diagnostics/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /await applicationPageEnvironment\(\)/);
  assert.match(page, /PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE/);
  assert.match(page, /participantIdentityAuthorityEnvironment\(env\)/);
  assert.match(page, /participantAuthExperienceConfiguration\(env\)/);

  const candidateNoop = diagnosticsRoute.slice(
    diagnosticsRoute.indexOf("if (authority.productionShadowCandidate) {", diagnosticsRoute.indexOf("const samples")),
    diagnosticsRoute.indexOf("recordSingleParticipantAuthClientDiagnostics", diagnosticsRoute.indexOf("const samples")),
  );
  assert.match(candidateNoop, /inserted: 0, suppressed: true/);
  assert.doesNotMatch(candidateNoop, /recordSingleParticipantAuthClientDiagnostics/);
  assert.ok(
    diagnosticsRoute.indexOf("verified.status !== \"active\"") < diagnosticsRoute.indexOf("inserted: 0, suppressed: true"),
    "candidate diagnostics no-op must still require an authenticated session",
  );
});

test("Production-shadow candidate cannot initialize or call the legacy Google Admin CMS path", async () => {
  const route = await readFile(new URL("../app/api/admin/cms/route.js", import.meta.url), "utf8");
  assert.match(route, /PRODUCTION_SHADOW_CANDIDATE_GOOGLE_ADMIN_UNAVAILABLE/);
  assert.match(route, /productionShadowCandidateEnvironment\(process\.env\)/);
  assert.doesNotMatch(route, /^import[\s\S]{0,240}from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/google-sheets-(?:write|data)/m);
  assert.match(route, /async function loadGoogleCmsRuntime\(\)/);
  const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  const postHandler = route.slice(route.indexOf("export async function POST"));
  for (const handler of [getHandler, postHandler]) {
    assert.ok(handler.indexOf("blockedProductionShadowCms()") >= 0);
    assert.ok(handler.indexOf("blockedProductionShadowCms()") < handler.indexOf("loadGoogleCmsRuntime();"));
  }
});

test("Google modules import without side effects but default operations retain the Preview workbook guard", () => {
  const dataModule = new URL("../lib/google-sheets-data.js", import.meta.url).href;
  const writeModule = new URL("../lib/google-sheets-write.js", import.meta.url).href;
  const script = `
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls += 1; throw new Error("network-called"); };
    const data = await import(${JSON.stringify(dataModule)});
    const write = await import(${JSON.stringify(writeModule)});
    const result = { imported: true, fetchCalls: 0, dataError: "", writeError: "" };
    try { await data.loadHistoricalData(); } catch (error) { result.dataError = error?.message || String(error); }
    try { await write.readWorkbookSheetTitles(); } catch (error) { result.writeError = error?.message || String(error); }
    result.fetchCalls = fetchCalls;
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_ENV: "preview",
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "must-not-be-used@example.invalid",
      GOOGLE_PRIVATE_KEY: "must-not-be-used",
    },
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.imported, true);
  assert.equal(result.dataError, "Preview data access is blocked from the production spreadsheet.");
  assert.equal(result.writeError, "Preview data access is blocked from the production spreadsheet.");
  assert.equal(result.fetchCalls, 0);
});

test("Production-shadow candidate blocks explicit Production archive reads before transport or fallback", () => {
  const dataModule = new URL("../lib/google-sheets-data.js", import.meta.url).href;
  const script = `
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls += 1; throw new Error("network-called"); };
    const data = await import(${JSON.stringify(dataModule)});
    const result = { fetchCalls: 0, error: "", code: "" };
    try { await data.loadScorecardSheets(); } catch (error) {
      result.error = error?.message || String(error);
      result.code = error?.code || "";
    }
    result.fetchCalls = fetchCalls;
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, ...candidateEnv },
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.code, "PRODUCTION_SHADOW_CANDIDATE_GOOGLE_READ_FORBIDDEN");
  assert.equal(result.error, "Google data access is unavailable on the Production-shadow candidate.");
  assert.equal(result.fetchCalls, 0);
});

test("malformed requested Production-shadow candidate also blocks explicit Google reads", () => {
  const dataModule = new URL("../lib/google-sheets-data.js", import.meta.url).href;
  const script = `
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls += 1; throw new Error("network-called"); };
    const data = await import(${JSON.stringify(dataModule)});
    const result = { fetchCalls: 0, code: "" };
    try { await data.loadScorecardSheets(); } catch (error) { result.code = error?.code || ""; }
    result.fetchCalls = fetchCalls;
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      ...candidateEnv,
      PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: "b".repeat(40),
    },
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.code, "PRODUCTION_SHADOW_CANDIDATE_GOOGLE_READ_FORBIDDEN");
  assert.equal(result.fetchCalls, 0);
});

test("live Production always remains Passport even when candidate variables are injected", () => {
  const live = participantIdentityAuthorityEnvironment({
    ...candidateEnv,
    VERCEL_ENV: "production",
    VERCEL_URL: "baggerinv.com",
    PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: "baggerinv.com",
  });
  assert.equal(live.resolved, "passport");
  assert.equal(live.participantAuthEnabled, false);
  assert.equal(live.productionShadowCandidate, false);
  assert.equal(live.productionBlocked, true);
  assert.equal(live.reason, "production-hard-block");
});

test("Production-shadow identity RPCs are allowlisted and Preview administration remains separate", () => {
  assert.equal(assertParticipantIdentityAdministrativeEnvironment(candidateEnv, {
    operation: "authorize_production_auth_candidate_otp_request",
  }).productionShadowCandidate, true);
  assert.throws(
    () => assertParticipantIdentityAdministrativeEnvironment(candidateEnv, { operation: "begin_preview_identity_impersonation" }),
    (error) => error.code === "PRODUCTION_SHADOW_IDENTITY_OPERATION_FORBIDDEN" && error.status === 403,
  );
  assert.throws(
    () => assertParticipantIdentityAdministrativeEnvironment(candidateEnv, { operation: "admin_link_auth_user_to_player" }),
    (error) => error.code === "PRODUCTION_SHADOW_IDENTITY_OPERATION_FORBIDDEN" && error.status === 403,
  );
});

test("Production-shadow Director entitlement authorizes only the explicit read-only diagnostic", async () => {
  const request = (pathname) => ({
    url: `https://${candidateHostname}${pathname}`,
    method: "GET",
    headers: new Headers({ host: candidateHostname, "x-forwarded-host": candidateHostname, "x-forwarded-proto": "https" }),
    cookies: { get: () => undefined, getAll: () => [] },
  });
  const dependencies = {
    verifyClaims: async () => ({ status: "active", claims: { sub: "00000000-0000-4000-8000-000000000001" } }),
    readEntitlement: async () => ({ payload: {
      ok: true,
      found: true,
      active: true,
      tournamentId: "2026",
      directorPlayerId: "DIR01",
      revision: 1,
      grantedAt: "2026-08-23T00:00:00.000Z",
    } }),
  };
  const allowed = await authorizePreviewDirector({
    request: request("/api/admin/data-authority-certification"),
    env: candidateEnv,
    allowBootstrap: false,
    dependencies,
  });
  assert.equal(allowed.status, "active");
  assert.equal(allowed.source, "production-shadow-entitlement");
  assert.equal(allowed.identity.session.type, "production-shadow-director-entitlement");

  const denied = await authorizePreviewDirector({
    request: request("/api/live-matches"),
    env: candidateEnv,
    allowBootstrap: true,
    dependencies,
  });
  assert.deepEqual(denied, {
    status: "forbidden",
    identity: null,
    code: "PRODUCTION_SHADOW_DIRECTOR_READ_ONLY",
  });
});

test("required CAPTCHA remains fail-closed when its key/configuration is unavailable", () => {
  const incomplete = { ...candidateEnv, PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "false" };
  assert.equal(participantAuthCaptchaConfigured(incomplete), false);
  const experience = participantAuthExperienceConfiguration(incomplete);
  assert.equal(experience.captchaRequired, true);
  assert.equal(experience.captchaReady, false);
  assert.equal(experience.captchaSiteKey, "");
  assert.equal(experience.defaultMethod, "email");
  assert.equal(participantAuthCaptchaConfigured(candidateEnv), true);
});

test("candidate SMS stays disabled until the candidate-only certification flag is explicit", () => {
  const inheritedPreviewSms = {
    ...candidateEnv,
    PARTICIPANT_SMS_AUTH_ENABLED: "true",
    PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET: "p".repeat(32),
  };
  const disabled = participantAuthExperienceConfiguration(inheritedPreviewSms);
  assert.equal(disabled.smsRequested, false);
  assert.equal(disabled.smsEnabled, false);
  assert.equal(disabled.defaultMethod, "email");
  assert.equal(disabled.candidateSmsCertified, false);

  const certified = participantAuthExperienceConfiguration({
    ...inheritedPreviewSms,
    PRODUCTION_SHADOW_CANDIDATE_SMS_CERTIFIED_ENABLED: "true",
  });
  assert.equal(certified.smsRequested, true);
  assert.equal(certified.smsEnabled, true);
  assert.equal(certified.candidateSmsCertified, true);
});

test("Auth request hashing uses an Auth-only HMAC and provider failures are classified distinctly", () => {
  const input = "127.0.0.1|browser";
  const one = participantAuthClientRequestHash(input, { secret: "a".repeat(32) });
  const two = participantAuthClientRequestHash(input, { secret: "b".repeat(32) });
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.notEqual(one, two);
  assert.deepEqual(classifyParticipantEmailOtpAuthError({ code: "over_email_send_rate_limit", status: 429 }), {
    captchaRejected: false,
    safeReason: "AUTH_SUPABASE_RATE_LIMITED",
    providerErrorClass: "SUPABASE_AUTH_RATE_LIMIT",
    providerCalled: false,
    responseCategory: "RATE_LIMITED",
    responseStatus: 429,
  });
  assert.equal(classifyParticipantEmailOtpAuthError({ code: "captcha_failed", status: 400 }).providerErrorClass, "CAPTCHA_REJECTED");
  assert.equal(classifyParticipantEmailOtpAuthError({ message: "SMTP provider rejected the request", status: 500 }).providerErrorClass, "SMTP_PROVIDER_REJECTION");
  assert.equal(classifyParticipantEmailOtpAuthError({ message: "network unavailable", status: 503 }).providerErrorClass, "SERVICE_UNAVAILABLE");
});

test("Production Auth preprovision evidence is exact, deterministic, and does not retain raw email", () => {
  const evidence = productionAuthPreprovisionEvidence({
    email: "Director@Example.com ",
    playerId: "DIR01",
    tournamentId: "2026",
    sourceFingerprint: "b".repeat(64),
    identitySourceFingerprint: "c".repeat(64),
  });
  assert.equal(evidence.emailIdentityHash, "8e1345637faf75a22d99c55a5566e2c2c067e8ca306e9252bba315283b7a67b6");
  assert.match(evidence.requestFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(evidence.claimInput.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(evidence.claimInput.project_url, PRODUCTION_SUPABASE_URL);
  assert.equal(evidence.claimInput.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(evidence.claimInput.operation, "PRODUCTION_DIRECTOR_AUTH_PREPROVISION");
  assert.equal(evidence.claimInput.tournament_id, "2026");
  assert.equal(evidence.claimInput.player_id, "DIR01");
  assert.equal(evidence.claimInput.identity_source_fingerprint, "c".repeat(64));
  assert.equal(evidence.claimInput.requested_by, "step10b-production-auth-bootstrap");
  assert.doesNotMatch(JSON.stringify(evidence), /director@example\.com/i);
  assert.throws(
    () => productionAuthPreprovisionEvidence({
      email: "director@example.com", playerId: "DIR01", tournamentId: "2025",
      sourceFingerprint: "b".repeat(64), identitySourceFingerprint: "c".repeat(64),
    }),
    (error) => error.code === "PRODUCTION_AUTH_PREPROVISION_EVIDENCE_REQUIRED",
  );
  assert.throws(
    () => productionAuthPreprovisionEvidence({
      email: "director@example.com", playerId: "DIR01", tournamentId: "2026",
      sourceFingerprint: "b".repeat(64),
    }),
    (error) => error.code === "PRODUCTION_AUTH_PREPROVISION_EVIDENCE_REQUIRED",
  );
});

test("Production Auth recovery is bound to one exact OTP request and Auth user", () => {
  const reference = productionAuthRecoveryReference({
    requestId: "11111111-1111-4111-8111-111111111111",
    authUserId: "22222222-2222-4222-8222-222222222222",
  });
  assert.deepEqual(reference, {
    requestId: "11111111-1111-4111-8111-111111111111",
    authUserId: "22222222-2222-4222-8222-222222222222",
  });
  assert.throws(
    () => productionAuthRecoveryReference({ authUserId: reference.authUserId }),
    (error) => error.code === "PRODUCTION_AUTH_RECOVERY_EXACT_REQUEST_REQUIRED",
  );
});

test("Production-shadow central identity resolver rejects PREPARED candidates and accepts only exact VERIFIED identity", async () => {
  const authUserId = "33333333-3333-4333-8333-333333333333";
  const base = {
    cookieStore: { getAll: () => [], get: () => undefined },
    tournamentId: "2026",
    env: candidateEnv,
  };
  let contextCalls = 0;
  await assert.rejects(
    resolveSupabaseParticipantIdentity({ ...base, dependencies: {
      verifyClaims: async () => ({ status: "active", claims: { sub: authUserId } }),
      readCandidate: async () => ({ payload: { found: true, status: "PREPARED", authUserId } }),
      readForAuth: async () => { contextCalls += 1; return { payload: { ok: true } }; },
    } }),
    (error) => error instanceof ParticipantIdentityResolutionError &&
      error.code === "PRODUCTION_AUTH_CERTIFICATION_REQUIRED" && error.status === 403,
  );
  assert.equal(contextCalls, 0);

  await assert.rejects(
    resolveSupabaseParticipantIdentity({ ...base, dependencies: {
      verifyClaims: async () => ({ status: "active", claims: { sub: authUserId } }),
      readCandidate: async () => ({ payload: { found: true, status: "VERIFIED",
        authUserId: "44444444-4444-4444-8444-444444444444" } }),
      readForAuth: async () => { contextCalls += 1; return { payload: { ok: true } }; },
    } }),
    (error) => error.code === "PRODUCTION_AUTH_CERTIFICATION_REQUIRED",
  );
  assert.equal(contextCalls, 0);

  const resolved = await resolveSupabaseParticipantIdentity({ ...base, dependencies: {
    verifyClaims: async () => ({ status: "active", claims: { sub: authUserId } }),
    readCandidate: async () => ({ payload: { found: true, status: "VERIFIED", authUserId } }),
    readForAuth: async ({ authUserId: requested }) => {
      contextCalls += 1;
      assert.equal(requested, authUserId);
      return { payload: { ok: true, data: {
        playerId: "DIR01", displayName: "Director",
        tournament: { id: "2026" }, membership: { active: true },
      } } };
    },
  } });
  assert.equal(resolved.playerId, "DIR01");
  assert.equal(contextCalls, 1);
});

test("post-Auth certification recording retries boundedly without requesting another OTP", async () => {
  let calls = 0;
  const result = await recordOtpVerificationWithRecovery({ request_id: "request-1", succeeded: true }, {
    attempts: 3,
    recordVerification: async (input) => {
      calls += 1;
      assert.equal(input.request_id, "request-1");
      if (calls < 3) throw new Error("transient database write failure");
      return { payload: { ok: true, status: "VERIFIED" } };
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.payload.status, "VERIFIED");

  let failedCalls = 0;
  await assert.rejects(
    recordOtpVerificationWithRecovery({}, {
      attempts: 99,
      recordVerification: async () => { failedCalls += 1; throw new Error("still unavailable"); },
    }),
    /still unavailable/,
  );
  assert.equal(failedCalls, 3);
});

test("server credential transport and Production Auth migration are browser-inaccessible", async () => {
  const [identityTransport, identityAuthority, candidateContract, candidateServer, authAdmin,
    verifyRoute, sessionRoute, migration, envExample] = await Promise.all([
    readFile(new URL("../lib/participant-identity-supabase.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/participant-identity-authority.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-shadow-candidate.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-shadow-candidate-server.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-auth-admin.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/participant/auth/otp/verify/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/participant/auth/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/production_migrations/202608230012_production_auth_director_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(identityTransport, /production-shadow-candidate-server/);
  assert.match(candidateContract, /PRODUCTION_SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(candidateContract, /NEXT_PUBLIC_PRODUCTION_SUPABASE_SECRET|NEXT_PUBLIC_SUPABASE_SECRET/);
  assert.match(candidateServer, /^import "server-only";/);
  assert.match(candidateServer, /secretKey: String\(env\.PRODUCTION_SUPABASE_SECRET_KEY/);
  assert.match(candidateServer, /SUPABASE_SCORING_MIRROR_URL: transport\.url/);
  assert.match(candidateServer, /SUPABASE_SCORING_MIRROR_SECRET_KEY: transport\.secretKey/);
  assert.doesNotMatch(candidateServer, /env\.SUPABASE_SCORING_MIRROR_(?:URL|SECRET_KEY)/);
  assert.match(envExample, /PARTICIPANT_AUTH_RATE_LIMIT_SECRET=/);
  assert.match(envExample, /PRODUCTION_SHADOW_CANDIDATE_AUTH_PROVISIONING_ENABLED=false/);
  assert.match(envExample, /PRODUCTION_SHADOW_CANDIDATE_SMS_CERTIFIED_ENABLED=false/);
  assert.match(envExample, /PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA=/);

  assert.match(migration, /production_auth_candidates/);
  assert.match(migration, /production_auth_preprovision_claims/);
  assert.match(migration, /identity_source_fingerprint/);
  assert.match(migration, /production_control\.director_entitlements/);
  assert.match(migration, /production_control\.director_entitlement_events/);
  assert.doesNotMatch(migration, /create table(?: if not exists)? participant_identity\.production_director_entitlements/i);
  assert.doesNotMatch(migration, /participant_identity\.production_director_entitlement_events/i);
  assert.match(migration, /prepare_production_auth_candidate/);
  assert.match(migration, /claim_production_auth_candidate_preprovision/);
  assert.match(migration, /record_production_auth_candidate_preprovision_cleanup/);
  assert.match(migration, /complete_production_auth_candidate_preprovision/);
  assert.match(migration, /authorize_production_auth_candidate_otp_request/);
  assert.match(migration, /recover_production_auth_candidate_otp_verification/);
  assert.match(migration, /grant_production_director_entitlement/);
  assert.match(migration, /read_production_auth_candidate_context_for_auth/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp/);
  assert.match(migration, /participant_auth_otp_attempts_production_safe_reason_check/);
  assert.match(migration, /AUTH_SMTP_PROVIDER_REJECTED/);
  assert.match(migration, /requested_reason not in/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*least\('client:' \|\| client_hash, 'email:' \|\| email_hash\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*greatest\('client:' \|\| client_hash, 'email:' \|\| email_hash\)/);
  assert.match(migration, /revoke all on function public\.complete_production_auth_candidate_preprovision\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function production_control\.certify_production_auth_candidate_otp\(uuid,uuid,integer,boolean\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]+to (?:anon|authenticated)/i);
  assert.doesNotMatch(migration, /preview_director|impersonation|createUser|signInWithOtp/i);
  assert.doesNotMatch(migration, /admin_link_auth_user_to_player/i);
  assert.match(migration, /Bound rejected\/unknown identifiers before inserting another audit row/);
  assert.match(migration, /PRODUCTION_AUTH_PREPROVISION_APPROVED_IDENTITY_REQUIRED/);
  assert.match(migration, /identity_config_import_runs[\s\S]*status = 'APPROVED'/);
  assert.match(migration, /raw_app_meta_data->>'provisioning_scope'[\s\S]*is distinct from/);
  assert.match(migration, /user_player_links set status = 'PENDING'/);
  assert.match(migration, /participant_auth_identifiers[\s\S]*'VERIFICATION_PENDING'/);
  assert.match(migration, /user_player_links set[\s\S]*status = 'ACTIVE'/);
  assert.match(migration, /recover_production_auth_candidate_otp_verification\([\s\S]*target_request_id uuid,[\s\S]*target_auth_user_id uuid/);
  assert.match(migration, /PRODUCTION_AUTH_RECOVERY_ATTEMPT_SUPERSEDED/);
  assert.match(migration, /production-director-entitlement:2026:/);
  assert.match(migration, /step10b-production-director-certification/);
  assert.equal((migration.match(/\$\$/g) || []).length % 2, 0, "migration dollar quotes must balance");
  const certificationFunction = migration.match(
    /create or replace function production_control\.certify_production_auth_candidate_otp\b[\s\S]*?\n\$\$;/,
  )?.[0] || "";
  const certificationAuditValues = certificationFunction.match(
    /insert into participant_identity\.identity_audit_events \(\s*event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata\s*\) values \(([\s\S]*?)\n  \);\n  return jsonb_build_object\('ok', true, 'status', 'VERIFIED'/,
  )?.[1];
  assert.ok(certificationAuditValues, "certification audit insert must be structurally present");
  assert.equal(splitSqlTopLevel(certificationAuditValues).length, 7,
    "certification audit insert must have exactly one value per audit column");
  for (const functionName of [
    "claim_production_auth_candidate_preprovision",
    "complete_production_auth_candidate_preprovision",
    "prepare_production_auth_candidate",
    "record_production_auth_candidate_preprovision_cleanup",
    "read_production_auth_candidate",
    "authorize_production_auth_candidate_otp_request",
    "record_production_auth_candidate_otp_delivery",
    "authorize_production_auth_candidate_otp_verification",
    "record_production_auth_candidate_otp_verification",
    "recover_production_auth_candidate_otp_verification",
    "read_production_auth_candidate_context_for_auth",
    "read_production_auth_candidate_player_context",
    "record_production_auth_candidate_logout",
    "read_production_director_entitlement",
    "grant_production_director_entitlement",
    "revoke_production_director_entitlement",
  ]) {
    const body = migration.match(new RegExp(`create or replace function public\\.${functionName}\\b[\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] || "";
    assert.match(body, /assert_production_auth_candidate_rpc\(\)/, `${functionName} must assert dormant exact Production scope`);
  }

  assert.doesNotMatch(identityAuthority, /"admin_link_auth_user_to_player"/);
  assert.match(authAdmin, /claim_production_auth_candidate_preprovision/);
  assert.match(authAdmin, /record_production_auth_candidate_preprovision_cleanup/);
  const productionProvisioner = authAdmin.slice(
    authAdmin.indexOf("export async function provisionProductionCandidateAuthUser"),
    authAdmin.indexOf("function productionAuthCollisionError"),
  );
  assert.ok(productionProvisioner.indexOf("claim_production_auth_candidate_preprovision") <
    productionProvisioner.indexOf("auth.admin.createUser"));
  assert.match(productionProvisioner, /email_confirm: false/);
  assert.doesNotMatch(productionProvisioner, /email_confirm: true|password\s*:/);
  assert.ok(productionProvisioner.indexOf("auth.admin.deleteUser") <
    productionProvisioner.lastIndexOf("record_production_auth_candidate_preprovision_cleanup"));
  assert.match(verifyRoute, /recordOtpVerificationWithRecovery/);
  assert.doesNotMatch(verifyRoute, /RECOVERY_PENDING|status:\s*202/);
  assert.match(verifyRoute, /signOut\(\{ scope: "global" \}\)/);
  assert.match(verifyRoute, /failClosedAuthResponse/);
  assert.match(verifyRoute, /AUTH_CERTIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(sessionRoute, /recoverSingleParticipantOtpVerification|PRODUCTION_AUTH_CERTIFICATION_RECOVERY_PENDING/);
  assert.match(identityTransport, /read_production_auth_candidate_context_for_auth/);
  assert.match(identityTransport, /read_production_auth_candidate_player_context/);
});
