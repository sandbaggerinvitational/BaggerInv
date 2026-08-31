import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateAuthoritativeParticipantSession } from
  "../lib/scoring-participant-authorization.js";
import { authorizePreviewDirector } from
  "../lib/preview-director-authorization.js";
import {
  PRODUCTION_VERCEL_PROJECT_ID,
} from "../lib/production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

async function importIdentityDispatch() {
  const moduleSource = await source("lib/production-current-participant-identity-server.js");
  const transformed = moduleSource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{ readProductionCurrentTournamentRuntime \} from "\.\/production-current-tournament-runtime\.js";/,
      "async function readProductionCurrentTournamentRuntime() { throw new Error('not-injected'); }",
    );
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

const frozenRuntime = Object.freeze({
  tournamentId: "2026",
  tournamentYear: 2026,
  lifecycle: "ACTIVE",
  status: "FROZEN_2026_RUNTIME",
  pointerRevision: 1,
});

const futureRuntime = Object.freeze({
  tournamentId: "2029",
  tournamentYear: 2029,
  lifecycle: "ACTIVE",
  status: "ACTIVE",
  pointerRevision: 4,
  runtimeGenerationId: "11111111-1111-4111-8111-111111111111",
  authorityGenerationId: "22222222-2222-4222-8222-222222222222",
  admissionGenerationId: "33333333-3333-4333-8333-333333333333",
});

test("identity dispatch preserves frozen 2026 names and maps logical plus concrete future first-login aliases", async () => {
  const { productionCurrentParticipantIdentityRpcResolution } =
    await importIdentityDispatch();
  const body = Object.freeze({ input: Object.freeze({ email: "player@example.org" }) });
  const frozen = productionCurrentParticipantIdentityRpcResolution({
    logicalFunctionName: "authorize_production_participant_otp_request",
    frozenFunctionName: "authorize_production_participant_otp_request",
    body,
    runtime: frozenRuntime,
  });
  assert.equal(frozen.functionName, "authorize_production_participant_otp_request");
  assert.equal(frozen.body, body);
  assert.equal(frozen.futureGeneration, false);

  const cases = [
    ["authorize_single_participant_otp_request",
      "authorize_production_future_participant_otp_request_v1"],
    ["authorize_production_participant_otp_request",
      "authorize_production_future_participant_otp_request_v1"],
    ["complete_production_participant_first_login",
      "complete_production_future_participant_first_login_v1"],
    ["record_production_participant_first_login_cleanup",
      "record_production_future_participant_first_login_cleanup_v1"],
  ];
  for (const [logicalFunctionName, expected] of cases) {
    const value = productionCurrentParticipantIdentityRpcResolution({
      logicalFunctionName,
      frozenFunctionName: logicalFunctionName,
      body,
      runtime: futureRuntime,
    });
    assert.equal(value.functionName, expected);
    assert.equal(value.tournamentId, "2029");
  }

  const director = productionCurrentParticipantIdentityRpcResolution({
    logicalFunctionName: "read_production_director_entitlement",
    frozenFunctionName: "read_production_cutover_director_entitlement",
    body: { target_auth_user_id: "user", target_tournament_id: "2026" },
    runtime: futureRuntime,
  });
  assert.equal(director.body.target_tournament_id, "2029");
  assert.throws(() => productionCurrentParticipantIdentityRpcResolution({
    logicalFunctionName: "read_production_director_entitlement",
    frozenFunctionName: "read_production_cutover_director_entitlement",
    body: {},
    runtime: { ...futureRuntime, admissionGenerationId: "" },
  }), (error) =>
    error.code === "PRODUCTION_CURRENT_TOURNAMENT_IDENTITY_GENERATION_UNCERTIFIED");
});

test("future controlled first-login binds Auth metadata to the server-selected tournament without changing the public call sequence", () => {
  const moduleUrl = new URL("../lib/production-participant-auth-enrollment.js",
    import.meta.url).href;
  const script = `
    const { authorizeProductionParticipantEmailOtpEligibility } =
      await import(${JSON.stringify(moduleUrl)});
    const calls = [];
    const decisions = [
      { ok: true, allowed: false, provisioningRequired: true,
        claimId: "11111111-1111-4111-8111-111111111111",
        playerId: "P100", email: "approved@example.org",
        tournamentId: "2029", recoveryAuthUserId: null },
      { ok: true, allowed: true, provisioningRequired: false,
        requestId: "22222222-2222-4222-8222-222222222222",
        playerId: "P100", authUserId: "33333333-3333-4333-8333-333333333333",
        email: "approved@example.org", tournamentId: "2029",
        verificationType: "signup" },
    ];
    const rpc = async (name, input) => {
      calls.push({ kind: "rpc", name, input });
      if (name === "authorize_production_participant_otp_request") {
        return { payload: decisions.shift(), productionRuntime: {
          tournamentId: "2029", pointerRevision: 4,
          futureGeneration: true,
        } };
      }
      if (name === "complete_production_participant_first_login") {
        return { payload: { ok: true } };
      }
      throw new Error("unexpected-rpc:" + name);
    };
    const adminClient = { auth: { admin: {
      createUser: async (input) => {
        calls.push({ kind: "create", input });
        return { data: { user: {
          id: "33333333-3333-4333-8333-333333333333", email: input.email,
        } }, error: null };
      },
      deleteUser: async () => ({ error: null }),
      getUserById: async () => ({ data: { user: null }, error: null }),
    } } };
    const result = await authorizeProductionParticipantEmailOtpEligibility({
      email: "approved@example.org", client_request_hash: "a".repeat(64),
    }, { env: {}, rpc, adminClient });
    process.stdout.write(JSON.stringify({ result, calls }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.result.ok, true);
  assert.equal(output.result.authorization.payload.tournamentId, "2029");
  const create = output.calls.find((entry) => entry.kind === "create").input;
  assert.equal(create.app_metadata.tournament_id, "2029");
  assert.equal(create.app_metadata.player_id, "P100");
  assert.deepEqual(output.calls.filter((entry) => entry.kind === "rpc")
    .map((entry) => entry.name), [
    "authorize_production_participant_otp_request",
    "complete_production_participant_first_login",
    "authorize_production_participant_otp_request",
  ]);
});

test("future first-login rejects missing or mismatched runtime tournament before Auth Admin", () => {
  const moduleUrl = new URL("../lib/production-participant-auth-enrollment.js",
    import.meta.url).href;
  const script = `
    const { authorizeProductionParticipantEmailOtpEligibility } =
      await import(${JSON.stringify(new URL("../lib/production-participant-auth-enrollment.js", import.meta.url).href)});
    let createCalls = 0;
    const adminClient = { auth: { admin: {
      createUser: async () => { createCalls += 1; throw new Error("must-not-run"); },
      deleteUser: async () => ({ error: null }),
      getUserById: async () => ({ data: { user: null }, error: null }),
    } } };
    const base = { ok: true, allowed: false, provisioningRequired: true,
      claimId: "11111111-1111-4111-8111-111111111111",
      playerId: "P100", email: "approved@example.org" };
    const cases = [
      { payload: base, productionRuntime: {
        tournamentId: "2029", pointerRevision: 4, futureGeneration: true,
      } },
      { payload: { ...base, tournamentId: "2028" }, productionRuntime: {
        tournamentId: "2029", pointerRevision: 4, futureGeneration: true,
      } },
      { payload: { ...base, tournamentId: "2029" } },
    ];
    const results = [];
    for (const authorization of cases) {
      const rpc = async () => authorization;
      results.push(await authorizeProductionParticipantEmailOtpEligibility({
        email: "approved@example.org", client_request_hash: "a".repeat(64),
      }, { env: {}, rpc, adminClient }));
    }
    process.stdout.write(JSON.stringify({ results, createCalls }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.createCalls, 0);
  assert.ok(output.results.every((result) => result.ok === false));
  assert.ok(output.results.every((result) =>
    result.diagnostics.databaseCode ===
      "PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_INVALID"));
});

const sha = "a".repeat(40);
const productionIdentityEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_GIT_COMMIT_SHA: sha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "IDENTITY",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: sha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}`,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-publishable-key",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
});

function scoringDependencies(directorTournamentId) {
  return {
    env: productionIdentityEnv,
    requireIdentityAuthority: () => ({ resolved: "supabase" }),
    requireScoreAuthority: () => ({ resolved: "supabase" }),
    authorizeDirector: async () => ({
      status: "active",
      identity: {
        authUserId: "44444444-4444-4444-8444-444444444444",
        actor: { id: "CB01" },
        tournamentId: directorTournamentId,
        session: {
          tournamentId: directorTournamentId,
          entitlementRevision: 7,
        },
      },
    }),
  };
}

function productionRequest() {
  const headers = new Headers({
    host: "baggerinv.com",
    "x-forwarded-host": "baggerinv.com",
    "x-forwarded-proto": "https",
    origin: "https://baggerinv.com",
  });
  return {
    method: "GET",
    url: "https://baggerinv.com/api/director",
    headers,
    cookies: { get: () => undefined, getAll: () => [] },
  };
}

test("Production Director authorization selects the certified future pointer before Auth and preserves global Owner UI continuity", async () => {
  let entitlementInput;
  let claimReads = 0;
  const result = await authorizePreviewDirector({
    request: productionRequest(),
    env: productionIdentityEnv,
    allowBootstrap: false,
    dependencies: {
      readCurrentTournamentRuntime: async () => futureRuntime,
      verifyClaims: async () => {
        claimReads += 1;
        return { status: "active", claims: {
          sub: "44444444-4444-4444-8444-444444444444",
        } };
      },
      readEntitlement: async (input) => {
        entitlementInput = input;
        return { payload: {
          ok: true, found: true, active: true, status: "ACTIVE",
          tournamentId: "2029", directorPlayerId: "CB01",
          role: "OWNER", revision: 7,
        } };
      },
    },
  });
  assert.equal(result.status, "active");
  assert.equal(result.identity.tournamentId, "2029");
  assert.deepEqual(entitlementInput, {
    authUserId: "44444444-4444-4444-8444-444444444444",
    tournamentId: "2029",
  });
  assert.equal(claimReads, 1);

  claimReads = 0;
  const uncertified = await authorizePreviewDirector({
    request: productionRequest(),
    env: productionIdentityEnv,
    dependencies: {
      readCurrentTournamentRuntime: async () => ({
        ...futureRuntime,
        admissionGenerationId: futureRuntime.authorityGenerationId,
      }),
      verifyClaims: async () => {
        claimReads += 1;
        return { status: "active", claims: { sub: "unexpected" } };
      },
    },
  });
  assert.equal(uncertified.status, "unavailable");
  assert.equal(uncertified.code,
    "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_UNAVAILABLE");
  assert.equal(claimReads, 0);

  const predecessorEntitlement = await authorizePreviewDirector({
    request: productionRequest(),
    env: productionIdentityEnv,
    dependencies: {
      readCurrentTournamentRuntime: async () => futureRuntime,
      verifyClaims: async () => ({ status: "active", claims: {
        sub: "44444444-4444-4444-8444-444444444444",
      } }),
      readEntitlement: async () => ({ payload: {
        ok: true, found: true, active: true, status: "ACTIVE",
        tournamentId: "2026", directorPlayerId: "CB01",
        role: "DIRECTOR", revision: 7,
      } }),
    },
  });
  assert.equal(predecessorEntitlement.status, "forbidden");
  assert.equal(predecessorEntitlement.code, "DIRECTOR_ENTITLEMENT_UNAVAILABLE");
});

test("authoritative scoring accepts the pointer-selected frozen or future Director and rejects a predecessor session", async () => {
  const frozen = await validateAuthoritativeParticipantSession({}, {
    scope: "admin", tournamentId: "2026",
  }, { dependencies: scoringDependencies("2026") });
  assert.equal(frozen.director.tournamentId, "2026");

  const future = await validateAuthoritativeParticipantSession({}, {
    scope: "admin", tournamentId: "2029",
  }, { dependencies: scoringDependencies("2029") });
  assert.equal(future.director.tournamentId, "2029");
  assert.equal(future.director.playerId, "CB01");

  await assert.rejects(() => validateAuthoritativeParticipantSession({}, {
    scope: "admin", tournamentId: "2026",
  }, { dependencies: scoringDependencies("2029") }), (error) =>
    error.code === "DIRECTOR_TOURNAMENT_SCOPE_MISMATCH");
});

test("migration 070 keeps global Owner governance separate from target-year Director and participant eligibility", async () => {
  const migration = await source(
    "supabase/production_migrations/202608300070_production_future_identity_mobile_dispatch_v1.sql",
  );
  assert.match(migration, /future_global_owner_eligibility_v1\(\)/);
  assert.match(migration, /owner_value\.tournament_id = '2026'/);
  assert.match(migration, /entitlement\.tournament_id = target_tournament/);
  assert.match(migration, /entitlement\.role = 'DIRECTOR'/);
  assert.doesNotMatch(migration,
    /insert into participant_identity\.tournament_roles[\s\S]{0,500}'DIRECTOR', true,[\s\S]{0,100}future-runtime-owner-activation/);
  assert.match(migration, /contact_state = 'APPROVED'/);
  assert.match(migration, /enrollment_state = 'NOT_ENROLLED'/);
  assert.match(migration, /pg_advisory_xact_lock_shared\([\s\S]{0,120}scoring_admission_lock_key/);
});
