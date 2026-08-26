import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_CUTOVER_CONFIGURATION_PLAN,
  PRODUCTION_CUTOVER_PHASES,
  PRODUCTION_VERCEL_PROJECT_ID,
  assertProductionCutoverActivation,
  productionCutoverActivationEnvironment,
  productionCutoverRequestEnvironment,
} from "../lib/production-cutover-activation-contract.js";
import {
  authorizePreviewDirector,
  productionDirectorEntitlementEnvironment,
} from "../lib/preview-director-authorization.js";
import { validateAuthoritativeParticipantSession } from "../lib/scoring-participant-authorization.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const commitSha = "a".repeat(40);
const epochId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_GIT_COMMIT_SHA: commitSha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_CANONICAL_DOMAIN: "https://BAGGERINV.COM/",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
});

const identityEnv = Object.freeze({
  ...baseEnv,
  PRODUCTION_CUTOVER_PHASE: "IDENTITY",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_production_placeholder",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "true",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
});

function request({ method = "POST", origin = "https://baggerinv.com", host = "baggerinv.com" } = {}) {
  const headers = new Headers({ host, "x-forwarded-host": host, "x-forwarded-proto": "https" });
  if (origin) headers.set("origin", origin);
  return { method, url: "https://baggerinv.com/api/director", headers, cookies: { get: () => undefined, getAll: () => [] } };
}

function activeEntitlement() {
  return { payload: {
    ok: true,
    found: true,
    active: true,
    status: "ACTIVE",
    tournamentId: "2026",
    directorPlayerId: "CB01",
    revision: 7,
    linkedAt: "2026-08-24T12:00:00.000Z",
  } };
}

test("Production activation requires the exact normalized server resource tuple and frozen SHA", () => {
  const state = productionCutoverActivationEnvironment(baseEnv);
  assert.equal(state.allowed, true);
  assert.equal(state.serverEnvironmentOnly, true);
  assert.equal(state.resources.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(state.resources.workbookId, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(state.resources.canonicalOrigin, "https://baggerinv.com");
  assert.equal(state.resources.commitSha, commitSha);
  assert.equal(state.phase, "STATIC_BACKEND");
  assert.deepEqual(PRODUCTION_CUTOVER_PHASES.slice(0, 3), ["STATIC_BACKEND", "READ_CUTOVER", "IDENTITY"]);
  assert.match(PRODUCTION_CUTOVER_CONFIGURATION_PLAN.firstCanonicalWriteBoundary, /commit_production_authority_epoch/);

  const cases = [
    [{ ...baseEnv, VERCEL_ENV: "preview" }, "production-environment-required"],
    [{ ...baseEnv, PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" }, "production-project-ref-required"],
    [{ ...baseEnv, PRODUCTION_SUPABASE_URL: `${PRODUCTION_SUPABASE_URL}.evil.example` }, "production-project-url-required"],
    [{ ...baseEnv, GOOGLE_SHEETS_ID: "preview-workbook" }, "production-workbook-required"],
    [{ ...baseEnv, PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com.evil.example" }, "production-canonical-domain-required"],
    [{ ...baseEnv, PRODUCTION_CUTOVER_TOURNAMENT_ID: "2027" }, "production-tournament-id-required"],
    [{ ...baseEnv, VERCEL_GIT_COMMIT_SHA: "b".repeat(40) }, "exact-production-commit-required"],
    [{ ...baseEnv, VERCEL_PROJECT_ID: "prj_preview" }, "exact-vercel-project-required"],
  ];
  for (const [env, reason] of cases) {
    const inspected = productionCutoverActivationEnvironment(env);
    assert.equal(inspected.allowed, false, reason);
    assert.equal(inspected.reason, reason);
    assert.throws(() => assertProductionCutoverActivation({ env }), { code: "PRODUCTION_CUTOVER_RESOURCE_MISMATCH" });
  }
});

test("identity phase cannot be eligible without Director Auth and legacy-admin revalidation", () => {
  const missing = productionCutoverActivationEnvironment({ ...baseEnv, PRODUCTION_CUTOVER_PHASE: "IDENTITY" });
  assert.equal(missing.allowed, false);
  assert.equal(missing.reason, "production-director-auth-required");
  const missingRevalidation = productionCutoverActivationEnvironment({
    ...baseEnv,
    PRODUCTION_CUTOVER_PHASE: "IDENTITY",
    PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  });
  assert.equal(missingRevalidation.allowed, false);
  assert.equal(missingRevalidation.reason, "production-admin-session-revalidation-required");
  assert.equal(productionCutoverActivationEnvironment(identityEnv).allowed, true);
});

test("Production mutation request proof is same-origin and derives environment only from server configuration", () => {
  assert.equal(productionCutoverRequestEnvironment(request(), identityEnv).allowed, true);
  assert.equal(productionCutoverRequestEnvironment(request({ origin: "https://evil.example" }), identityEnv).reason,
    "exact-production-request-origin-required");
  assert.equal(productionCutoverRequestEnvironment(request({ host: "preview.example" }), identityEnv).reason,
    "exact-production-request-host-required");
  const spoofed = request();
  spoofed.headers.set("x-environment", "PRODUCTION");
  assert.equal(productionCutoverRequestEnvironment(spoofed, { ...identityEnv, VERCEL_ENV: "preview" }).allowed, false);
});

test("live legacy Production Director authorization is unchanged while dormant activation is disabled", async () => {
  let passportInspections = 0;
  let entitlementReads = 0;
  const result = await authorizePreviewDirector({
    request: request({ method: "GET", origin: "" }),
    env: { ...baseEnv, PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "false" },
    dependencies: {
      inspectPassport: async () => { passportInspections += 1; return { status: "inactive", identity: null }; },
      readEntitlement: async () => { entitlementReads += 1; return activeEntitlement(); },
    },
  });
  assert.equal(result.status, "inactive");
  assert.equal(passportInspections, 1);
  assert.equal(entitlementReads, 0);
});

test("Production Director activation uses current Auth claims and Production entitlement with no Passport bootstrap", async () => {
  assert.equal(productionDirectorEntitlementEnvironment(identityEnv).enabled, true);
  let passportInspections = 0;
  let entitlementInput;
  const result = await authorizePreviewDirector({
    request: request(),
    env: identityEnv,
    allowBootstrap: true,
    dependencies: {
      verifyClaims: async () => ({ status: "active", claims: { sub: authUserId } }),
      readEntitlement: async (input) => { entitlementInput = input; return activeEntitlement(); },
      inspectPassport: async () => { passportInspections += 1; return { status: "active" }; },
    },
  });
  assert.equal(result.status, "active");
  assert.equal(result.source, "production-director-entitlement");
  assert.equal(result.identity.authUserId, authUserId);
  assert.equal(result.identity.actor.id, "CB01");
  assert.equal(result.identity.session.type, "production-director-entitlement");
  assert.deepEqual(entitlementInput, { authUserId, tournamentId: "2026" });
  assert.equal(passportInspections, 0);

  const invalid = await authorizePreviewDirector({
    request: request(),
    env: { ...identityEnv, VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
    dependencies: { inspectPassport: async () => { passportInspections += 1; return { status: "active" }; } },
  });
  assert.equal(invalid.status, "forbidden");
  assert.equal(invalid.code, "PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED");
  assert.equal(passportInspections, 0);
});

test("Production legacy admin scoring cookie is insufficient once revalidation is explicitly enabled", async () => {
  const session = { scope: "admin", tournamentId: "2026" };
  const dependencies = {
    env: { ...identityEnv, SCORING_AUTHORITY: "supabase" },
    requireIdentityAuthority: () => ({ resolved: "supabase" }),
    requireScoreAuthority: () => ({ resolved: "supabase" }),
    authorizeDirector: async () => ({ status: "inactive", identity: null, code: "AUTH_SESSION_REQUIRED" }),
  };
  await assert.rejects(
    () => validateAuthoritativeParticipantSession(request(), session, { dependencies, cookieStore: { getAll: () => [], get: () => undefined, set: () => {} } }),
    (error) => error.code === "CURRENT_DIRECTOR_AUTH_REQUIRED",
  );
  dependencies.authorizeDirector = async () => ({ status: "active", identity: {
    authUserId,
    actor: { id: "CB01" },
    tournamentId: "2026",
    session: { entitlementRevision: 7 },
  } });
  const allowed = await validateAuthoritativeParticipantSession(request(), session, {
    dependencies,
    cookieStore: { getAll: () => [], get: () => undefined, set: () => {} },
  });
  assert.equal(allowed.writable, true);
  assert.deepEqual(allowed.director, {
    authUserId,
    playerId: "CB01",
    tournamentId: "2026",
    entitlementRevision: 7,
  });
});

test("Production Google write lease is opt-in, epoch-bound, and replaces caller resource claims", () => {
  const moduleUrl = new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url).href;
  const script = `
    import { beginProductionGoogleAuthorityWrite, reportProductionGoogleAuthorityWriteOutcome } from ${JSON.stringify(moduleUrl)};
    const admissionGeneration = "44444444-4444-4444-8444-444444444444";
    const env = ${JSON.stringify({
      ...baseEnv,
      PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: epochId,
      VERCEL_DEPLOYMENT_ID: "dpl_12345678Test",
    })};
    env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION = admissionGeneration;
    const calls = [];
    const responses = [
      { ok: true, activation_revision: 11, admission_revision: 7, authority_generation_id: ${JSON.stringify(epochId)},
        admission_generation_id: admissionGeneration, deployment_id: env.VERCEL_DEPLOYMENT_ID,
        authority: "GOOGLE", admission_state: "OPEN" },
      { ok: true, lease_id: "33333333-3333-4333-8333-333333333333", authority: "GOOGLE",
        authority_generation_id: ${JSON.stringify(epochId)}, admission_generation_id: admissionGeneration,
        writer_intent: "CANONICAL_LEGACY", operation_request_id: "55555555-5555-4555-8555-555555555555",
        replay_usable: true },
      { ok: true, resolution_state: "PROVEN_NO_WRITE", idempotent: false },
    ];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
    };
    const lease = await beginProductionGoogleAuthorityWrite({
      environment: "PREVIEW", project_ref: "idgigvjjqkfbqjeredpb", source_workbook_id: "preview",
      tournamentId: "2026", matchId: "2026-R1-1", actorId: "CB01", operation: "DIRECTOR:MARK-LIVE",
      operationRequestId: "55555555-5555-4555-8555-555555555555",
      scoringAuthorityContract: { version: "scoring-mutation-authority-v1", scoringAuthority: "google",
        authorityGeneration: ${JSON.stringify(epochId)}, admissionGeneration, activationRevision: 11, admissionRevision: 7,
        deploymentId: env.VERCEL_DEPLOYMENT_ID, deploymentCommit: env.VERCEL_GIT_COMMIT_SHA },
      request: { method: "POST", url: "https://baggerinv.com/api/director", headers: new Headers({ host: "baggerinv.com",
        origin: "https://baggerinv.com", "x-forwarded-host": "baggerinv.com", "x-forwarded-proto": "https" }) },
    }, { env, fetchImpl });
    await reportProductionGoogleAuthorityWriteOutcome(lease, { outcomeState: "PROVEN_NO_WRITE",
      providerMutationKey: lease.providerMutationKey, writeStarted: false }, { env, fetchImpl });
    process.stdout.write(JSON.stringify({ calls, leaseId: lease.leaseId }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const evidence = JSON.parse(child.stdout);
  assert.equal(evidence.calls.length, 3);
  assert.match(evidence.calls[0].url, /inspect_production_scoring_admission$/);
  const begin = evidence.calls[1].body.input;
  assert.equal(begin.environment, "PRODUCTION");
  assert.equal(begin.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(begin.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(begin.expected_authority, "GOOGLE");
  assert.equal(begin.expected_authority_generation, epochId);
  assert.equal(begin.expected_admission_generation, "44444444-4444-4444-8444-444444444444");
  assert.equal(begin.writer_intent, "CANONICAL_LEGACY");
  assert.equal(begin.expected_activation_revision, 11);
  assert.equal(begin.expected_admission_revision, 7);
  assert.equal(begin.deployment_commit, commitSha);
  assert.equal(evidence.calls[2].body.input.lease_id, evidence.leaseId);
  assert.equal(evidence.calls[2].body.input.outcome_state, "PROVEN_NO_WRITE");
  assert.equal(evidence.calls[2].body.input.actor_id, "CB01");
});

test("all foreground and high-impact Google writer boundaries include the dormant lease gate", async () => {
  const [ingress, persistence, director, liveMatches] = await Promise.all([
    readFile(new URL("../lib/production-cutover-scoring-ingress.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/scoring-persistence-adapter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/director/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/live-matches/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(ingress, /import "server-only"/);
  assert.match(ingress, /inspect_production_scoring_admission/);
  assert.match(ingress, /begin_production_scoring_ingress_v2/);
  assert.match(ingress, /mark_production_scoring_ingress_write_started/);
  assert.match(ingress, /report_production_scoring_ingress_outcome/);
  assert.doesNotMatch(ingress, /complete_production_scoring_ingress/);
  assert.match(persistence, /withProductionGoogleAuthorityWrite/);
  assert.match(director, /withProductionGoogleAuthorityWrite/);
  assert.doesNotMatch(director, /completeProductionGoogleAuthorityWrite/);
  assert.match(liveMatches, /withProductionGoogleAuthorityWrite/);
  assert.match(liveMatches, /productionDirectorEntitlementEnvironment/);
});
