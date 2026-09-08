import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { productionNativeEnvironment, productionNativeControls, NATIVE_CAPABILITIES, PRODUCTION_NATIVE_CONTRACT, PRODUCTION_NATIVE_READ_SELECTORS } from "../lib/mobile-native-production-environment.js";
import Ajv from "ajv/dist/2020.js";
import { requireMobileNativeCapability, mobileNativeHealthResult, recheckMobileNativeIdentity } from "../lib/mobile-native-admission.js";
import { issueMobileNativeCertification, verifyMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { resolveMobileBearerIdentity } from "../lib/mobile-bearer-identity.js";
import { requestMobileNativeOtp, certifyMobileNativeOtp } from "../lib/mobile-native-auth.js";
import { mobileScoringHoleResult, mobileScoringFinalizeResult } from "../lib/mobile-v1-scoring.js";
import { environment, controls, authorityFixtures, request, actor, productionContext, runtime, sha } from "./fixtures/pn2-native.mjs";

// Reconciliation must preserve the actual Production deployment, including
// newer web changes absent from PN-1. No admission expectation is relaxed.
const base = "6d0b2ad5cab61f50e6d2a269bb2d02e036ccae05";
const root = new URL("../", import.meta.url);
const all = NATIVE_CAPABILITIES;
const code = (k) => `NATIVE_${k.toUpperCase()}_DISABLED`;
function issue(env, extra = {}) { return issueMobileNativeCertification({ ...actor, env, productionContext: productionContext(), ...extra }); }
function identityDependencies(env, fixtures) {
  return { nativeAdmission: fixtures.dependencies, verifyAccessToken: async () => ({ status: "active", authUserId: actor.authUserId }),
    readForAuth: async () => ({ payload: { ok: true, data: { ...actor, tournament: { id: "2026" }, membership: { active: true },
      matches: [{ matchId: "SYNTHETIC-M1", format: "SI" }] } } }),
    readCurrentTournamentRuntime: async () => fixtures.current };
}
async function authenticated(env, fixtures, capability = "reads", dependencies = {}) {
  const proof = issue(env);
  return resolveMobileBearerIdentity({ env, capability,
    request: request("session", { headers: { authorization: "Bearer synthetic", "x-bagger-certification": proof.token } }),
    dependencies: { ...identityDependencies(env, fixtures), ...dependencies } });
}

test("PN-2 every independent capability and all 16 combinations require explicit booleans", async () => {
  for (let mask = 0; mask < 16; mask++) {
    const enabled = all.filter((_, index) => mask & (1 << index));
    const env = environment(enabled), fixture = authorityFixtures(env);
    assert.equal(productionNativeEnvironment(env).available, true);
    for (const capability of all) {
      const operation = () => requireMobileNativeCapability(capability, { env, request: request(), dependencies: fixture.dependencies });
      if (enabled.includes(capability)) assert.ok(await operation(), `${mask}:${capability}`);
      else await assert.rejects(operation, { code: code(capability) });
    }
  }
});

test("PN-2 absent, malformed, stale, false, mixed-resource and unsupported controls deny before transport", async () => {
  const changes = [undefined, "", "null", "[]", "{}", "true", "{", JSON.stringify(controls()),
    ...["false", "true", 1, null].map((value) => JSON.stringify({ ...controls(all), capabilities: { ...controls(all).capabilities, reads: value } })),
    ...[{ version: "unknown" }, { environment: "preview" }, { apiOrigin: "https://native-preview.baggerinv.com" },
      { projectRef: "idgigvjjqkfbqjeredpb" }, { deploymentCommit: "b".repeat(40) }, { revision: 0 },
      { revision: "1" }, { revocationGeneration: "" }, { unexpected: true }].map((change) => JSON.stringify({ ...controls(all), ...change }))];
  for (const raw of changes) {
    const env = environment(all); env.PRODUCTION_NATIVE_CAPABILITIES = raw;
    let transports = 0;
    const dependencies = { inspectRead: async () => { transports++; }, inspectAdmission: async () => { transports++; }, readRuntime: async () => { transports++; } };
    for (const capability of all) await assert.rejects(() => requireMobileNativeCapability(capability, { env, request: request(), dependencies }), { code: code(capability) });
    assert.equal(transports, 0);
  }
});

test("PN-2 wrong runtime, Supabase, Vercel binding, credentials and client overrides fail closed", async () => {
  for (const change of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: "PRODUCTION" },
    { VERCEL_DEPLOYMENT_ID: "" }, { VERCEL_DEPLOYMENT_ID: "wrong" }, { PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true" },
    { PRODUCTION_STEP11_SCORING_REHEARSAL_ENABLED: "true" },
    { NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" }, { SUPABASE_SCORING_MIRROR_URL: "https://wrong.supabase.co" },
    { PARTICIPANT_IDENTITY_AUTHORITY: "passport" }, { VERCEL_PROJECT_ID: "wrong" }, { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
    { PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: "b".repeat(40) }, { SUPABASE_SCORING_MIRROR_SECRET_KEY: "different" }]) {
    const env = { ...environment(all), ...change };
    assert.equal(productionNativeEnvironment(env).available, false);
    await assert.rejects(() => requireMobileNativeCapability("reads", { env, request: request() }), { code: "MOBILE_API_UNAVAILABLE" });
  }
  const env = environment(), fixtures = authorityFixtures(env);
  await assert.rejects(() => requireMobileNativeCapability("reads", { env,
    request: request("session?nativeReads=true&playerId=OTHER&tournamentId=2099", { headers: { "x-native-reads": "true", "x-environment": "production" } }),
    dependencies: fixtures.dependencies }), { code: "NATIVE_READS_DISABLED" });
  env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls(all));
  for (const bad of [request("session", { headers: { "x-bagger-mobile-contract": "unknown" } }),
    request("session", { headers: { "x-bagger-mobile-contract": "" } })])
    await assert.rejects(() => requireMobileNativeCapability("reads", { env, request: bad }), { code: "CLIENT_UPDATE_REQUIRED" });
  for (const bad of [new Request("https://native-preview.baggerinv.com/api/mobile/v1/session"),
    request("session", { headers: { host: "evil.example" } }), request("session", { headers: { "x-forwarded-host": "evil.example" } })])
    await assert.rejects(() => requireMobileNativeCapability("reads", { env, request: bad }), { code: "MOBILE_API_UNAVAILABLE" });
});

test("PN-2 wrong database authority, ambiguous tournament and stale resource/deployment snapshots deny", async () => {
  const cases = [
    ["read", "deployment_commit", "b".repeat(40)], ["read", "project_ref", "wrong"], ["read", "source_workbook_id", "wrong"],
    ["read", "participant_identity_authority", "PASSPORT"], ["read", "current_tournament_read_authority", "GOOGLE"],
    ["read", "activation_state", "DORMANT"], ["read", "read_cutover_phase", "CURRENT_READS"], ["read", "public_supabase_reads_enabled", false],
    ["admission", "activation_revision", 161], ["admission", "admission_state", "OPEN"], ["admission", "admission_protocol_enforced", false],
    ["admission", "new_legacy_admission_allowed", true], ["admission", "deployment_id", "wrong"], ["admission", "authority_generation_id", "wrong"],
    ["admission", "admission_generation_id", "wrong"], ["admission", "maintenance_state", "unknown"],
    ["current", "lifecycle", "SUSPENDED"], ["current", "pointerRevision", 0], ["current", "contractVersion", "unknown"],
  ];
  for (const [part, key, value] of cases) {
    const env = environment(all), f = authorityFixtures(env); f[part][key] = value;
    for (const capability of all) await assert.rejects(() => requireMobileNativeCapability(capability, { env, request: request(), dependencies: f.dependencies }), { code: "AUTHORITY_INCOMPATIBLE" }, `${part}.${key}`);
  }
});

test("PN-2 scoring suspension and scoring maintenance preserve independently admitted reads/auth/cert", async () => {
  for (const change of [{ authority: "GOOGLE" }, { execution_gate: "PAUSED" }, { scoring_ingress_enabled: false }, { maintenance_state: "SCORING_MAINTENANCE" }]) {
    const env = environment(all), f = authorityFixtures(env); Object.assign(f.admission, change);
    for (const capability of ["reads", "auth", "certification"]) assert.ok(await requireMobileNativeCapability(capability, { env, request: request(), dependencies: f.dependencies }));
    await assert.rejects(() => requireMobileNativeCapability("scoring", { env, request: request(), dependencies: f.dependencies }));
    const health = await mobileNativeHealthResult(request("health"), { env, dependencies: f.dependencies });
    assert.equal(health.status, 200); assert.equal(health.body.capabilities.reads, true); assert.equal(health.body.capabilities.scoring, false);
  }
});

test("PN-2 public health separates valid default-off, invalid authority, and client update without leaking resources", async () => {
  const env = environment(); delete env.PRODUCTION_NATIVE_CAPABILITIES;
  const f = authorityFixtures(env);
  const result = await mobileNativeHealthResult(request("health"), { env, dependencies: f.dependencies });
  assert.equal(result.status, 200); assert.equal(result.body.compatibility, "COMPATIBLE");
  assert.deepEqual(result.body.capabilities, controls().capabilities);
  assert.deepEqual(Object.keys(result.body).sort(), ["ok", "apiVersion", "service", "environment", "contractVersion", "compatibility", "authority", "capabilities", "scoringStatus"].sort());
  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["secret", "project_ref", "deployment", sha, actor.authUserId, actor.playerId, "workbook", "162", "2026"])
    assert.equal(serialized.includes(forbidden), false, forbidden);
  const outdated = await mobileNativeHealthResult(request("health", { headers: { "x-bagger-mobile-contract": "unknown" } }), { env, dependencies: f.dependencies });
  assert.equal(outdated.status, 503); assert.equal(outdated.body.compatibility, "CLIENT_UPDATE_REQUIRED");
  f.read.participant_identity_authority = "PASSPORT";
  const invalid = await mobileNativeHealthResult(request("health"), { env, dependencies: f.dependencies });
  assert.equal(invalid.status, 503); assert.equal(invalid.body.compatibility, "AUTHORITY_INCOMPATIBLE");
  const schema = JSON.parse(await readFile(new URL("contracts/mobile/v1/production-health.schema.json", root), "utf8"));
  const validate = new Ajv().compile(schema);
  for (const item of [result, outdated, invalid]) assert.equal(validate(item.body), true, JSON.stringify(validate.errors));
});

test("PN-2 native reads cannot select legacy Google content even with valid database Supabase authority", async () => {
  for (const key of PRODUCTION_NATIVE_READ_SELECTORS) {
    const env = { ...environment(all), [key]: "google" };
    await assert.rejects(() => requireMobileNativeCapability("reads", { env, request: request() }), { code: "AUTHORITY_INCOMPATIBLE" }, key);
  }
});

test("PN-2 default health uses only existing read-only inspectors and resolver with no-store transport", async () => {
  const env = environment(), f = authorityFixtures(env), savedFetch = globalThis.fetch;
  delete env.PRODUCTION_NATIVE_CAPABILITIES;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const rpc = new URL(url).pathname.split("/").at(-1); calls.push(rpc);
    assert.equal(new URL(url).origin, env.PRODUCTION_SUPABASE_URL);
    assert.equal(options.cache, "no-store"); assert.equal(options.method, "POST");
    assert.equal(JSON.parse(options.body).input.project_ref, env.PRODUCTION_SUPABASE_PROJECT_REF);
    const result = { inspect_production_cutover_read_state: f.read, inspect_production_scoring_admission: f.admission,
      read_production_current_tournament_runtime_v1: { ok: true, ...f.current } }[rpc];
    assert.ok(result, `forbidden RPC ${rpc}`);
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await mobileNativeHealthResult(request("health"), { env });
    assert.equal(result.status, 200); assert.deepEqual(result.body.capabilities, controls().capabilities);
    assert.equal(calls.length, 3);
  } finally { globalThis.fetch = savedFetch; }
});

test("PN-2 certificate crossover, wrong actor/context, expiry, key reuse and revocation are rejected", () => {
  const env = environment(all), preview = { MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: env.MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET };
  const prod = issue(env), dev = issueMobileNativeCertification({ ...actor, env: preview });
  const verify = (token, selected = env, change = {}) => verifyMobileNativeCertification({ ...actor, token, env: selected, productionContext: productionContext(), ...change });
  assert.ok(verify(prod.token)); assert.ok(verify(dev.token, preview));
  assert.throws(() => verify(dev.token), { code: "AUTH_CERTIFICATION_FAILED" });
  assert.throws(() => verify(prod.token, preview), { code: "AUTH_CERTIFICATION_FAILED" });
  for (const change of [{ authUserId: "OTHER" }, { playerId: "OTHER" }, { tournamentId: "2099" },
    { now: () => Date.now() + 43201000 }, { productionContext: { ...productionContext(), runtime: { ...runtime, pointerRevision: 2 } } }])
    assert.throws(() => verify(prod.token, env, change), { code: "AUTH_CERTIFICATION_FAILED" });
  const revoked = { ...env, PRODUCTION_NATIVE_CAPABILITIES: JSON.stringify({ ...controls(all), revocationGeneration: "synthetic-generation-2" }) };
  assert.throws(() => verify(prod.token, revoked), { code: "AUTH_CERTIFICATION_FAILED" });
  assert.throws(() => issue({ ...env, PRODUCTION_NATIVE_CERTIFICATION_SIGNING_SECRET: env.MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET }), { code: "MOBILE_API_UNAVAILABLE" });
  assert.throws(() => issue(environment(["reads"])), { code: "NATIVE_CERTIFICATION_DISABLED" });
  // Closing issuance is independent from accepting an already issued proof.
  assert.ok(verify(prod.token, environment(["reads"])));
});

test("PN-2 bearer alone, inactive membership, cross-player and cross-tournament cannot pass", async () => {
  const env = environment(all), f = authorityFixtures(env), deps = identityDependencies(env, f);
  await assert.rejects(() => resolveMobileBearerIdentity({ env, request: request("session", { headers: { authorization: "Bearer synthetic" } }), dependencies: deps }), { code: "AUTH_CERTIFICATION_FAILED" });
  for (const changed of [{ playerId: "OTHER" }, { authUserId: "OTHER" }, { tournament: { id: "2099" } }, { membership: { active: false } }]) {
    await assert.rejects(() => authenticated(env, f, "reads", { readForAuth: async () => {
      const value = await deps.readForAuth(); Object.assign(value.payload.data, changed); return value;
    } }));
  }
  assert.equal((await authenticated(env, f)).playerId, actor.playerId);
});

test("PN-2 each kill switch denies subsequent work without invalidating unrelated existing sessions", async () => {
  const env = environment(all), f = authorityFixtures(env), identity = await authenticated(env, f);
  for (const disabled of all) {
    env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls(all.filter((k) => k !== disabled)));
    await assert.rejects(() => requireMobileNativeCapability(disabled, { env, request: request(), dependencies: f.dependencies }), { code: code(disabled) });
    if (disabled !== "reads") await recheckMobileNativeIdentity(identity, "reads", env);
    else await assert.rejects(() => recheckMobileNativeIdentity(identity, "reads", env), { code: "NATIVE_READS_DISABLED" });
  }
  env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls(all));
  f.current.pointerRevision++;
  await assert.rejects(() => recheckMobileNativeIdentity(identity, "reads", env), { code: "AUTH_CERTIFICATION_FAILED" });
});

test("PN-2 disabled auth/certification executes no provider, challenge, audit or certificate dependency", async () => {
  const env = environment(); let calls = 0;
  const dependencies = new Proxy({}, { get: () => async () => { calls++; throw new Error("forbidden"); } });
  await assert.rejects(() => requestMobileNativeOtp({ env, request: request("auth/otp/request"), input: {}, dependencies }), { code: "NATIVE_AUTH_DISABLED" });
  await assert.rejects(() => certifyMobileNativeOtp({ env, request: request("auth/otp/certify"), input: {}, dependencies }), { code: "NATIVE_CERTIFICATION_DISABLED" });
  assert.equal(calls, 0);
  // Enabling AUTH alone reaches ordinary input/anti-abuse validation, not reads.
  const on = environment(["auth"]), f = authorityFixtures(on);
  await assert.rejects(() => requestMobileNativeOtp({ env: on, request: request("auth/otp/request"), input: { method: "phone" }, dependencies: { nativeAdmission: f.dependencies } }), { code: "AUTH_METHOD_UNAVAILABLE" });
  const cert = environment(["certification"]), cf = authorityFixtures(cert);
  await assert.rejects(() => certifyMobileNativeOtp({ env: cert, request: request("auth/otp/certify"), input: { challengeId: actor.authUserId }, dependencies: { nativeAdmission: cf.dependencies } }), { code: "UNAUTHORIZED" });
});

test("PN-2 disabled scoring denies direct domain calls and authenticated queued intents before any persistence", async () => {
  const env = environment(all), f = authorityFixtures(env), identity = await authenticated(env, f, "scoring");
  env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls(["reads", "auth", "certification"]));
  let calls = 0;
  const dependencies = new Proxy({}, { get: () => () => { calls++; throw new Error("forbidden persistence or authorization"); } });
  for (const operation of [mobileScoringHoleResult, mobileScoringFinalizeResult]) {
    await assert.rejects(() => operation(identity, {}, { env, dependencies }), { code: "NATIVE_SCORING_DISABLED" });
    await assert.rejects(() => operation({ ...identity }, {}, { env, dependencies }), { code: "AUTH_CERTIFICATION_FAILED" });
  }
  assert.equal(calls, 0);
});

test("PN-2 scoring switch is rechecked after canonical authorization, before persistence and downstream effects", async () => {
  for (const operation of [mobileScoringHoleResult, mobileScoringFinalizeResult]) {
    for (const closeDuringAuthorization of [true, false]) {
      const env = environment(all), f = authorityFixtures(env), identity = await authenticated(env, f, "scoring");
      let persistence = 0, authorization = 0;
      const dependencies = {
        scoringAuthorityEnvironment: () => ({ resolved: "supabase" }), requireScoringReadSource: () => ({ resolved: "supabase" }),
        authorizeMatchAccess: async (input) => {
          authorization++; assert.equal(input.playerId, actor.playerId); assert.equal(input.tournamentId, "2026");
          if (closeDuringAuthorization) env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls(["reads", "auth", "certification"]));
          return { payload: { allowed: true, permission_revision: 1 } };
        },
        persistParticipantScore: async (input) => {
          persistence++; assert.equal(input.current.playerId, actor.playerId);
          // The real canonical transaction/receipt/outboxes are never invoked.
          throw new Error("synthetic canonical transaction boundary");
        },
      };
      const input = { matchId: "SYNTHETIC-M1", mutationId: "synthetic-mutation", expectedMatchRevision: 0,
        ...(operation === mobileScoringHoleResult ? { holeNumber: 1, expectedHoleRevision: 0, teamOneGrossScores: [4], teamTwoGrossScores: [5] } : {}) };
      await assert.rejects(() => operation(identity, input, { env, dependencies }),
        closeDuringAuthorization ? { code: "NATIVE_SCORING_DISABLED" } : undefined);
      assert.equal(authorization, 1); assert.equal(persistence, closeDuringAuthorization ? 0 : 1);
    }
  }
});

test("PN-2 certification-only requires a verified canonical challenge and rechecks issuance after asynchronous work", async () => {
  for (const closeDuringIdentity of [true, false]) {
    const env = environment(["certification"]), f = authorityFixtures(env);
    let issued = 0, identityReads = 0;
    const dependencies = {
      nativeAdmission: f.dependencies,
      verifyUser: async () => ({ status: "active", authUserId: actor.authUserId, email: "synthetic@example.test", emailVerified: true }),
      consumeCertificationRateLimit: () => ({ allowed: true }),
      authorizeVerification: async () => ({ payload: { allowed: true, ...actor } }),
      recordVerification: async () => ({ payload: { ok: true } }),
      readIdentity: async () => {
        identityReads++;
        if (closeDuringIdentity && identityReads === 2) env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls());
        return { payload: { ok: true, data: { ...actor, tournament: { id: "2026" }, membership: { active: true } } } };
      },
      issueCertification: (input) => { issued++; return issueMobileNativeCertification(input); },
    };
    const run = () => certifyMobileNativeOtp({ env, dependencies, request: request("auth/otp/certify", { headers: { authorization: "Bearer synthetic" } }), input: { challengeId: actor.authUserId } });
    if (closeDuringIdentity) await assert.rejects(run, { code: "NATIVE_CERTIFICATION_DISABLED" });
    else assert.match((await run()).body.data.certificationToken, /^v2p\./);
    assert.equal(issued, closeDuringIdentity ? 0 : 1);
    assert.equal(productionNativeControls(env).capabilities.auth, false);
  }
});

test("PN-2 auth rechecks before provider delivery after asynchronous eligibility and identity work", async () => {
  const env = environment(["auth"]), f = authorityFixtures(env);
  let deliveries = 0;
  const dependencies = {
    nativeAdmission: f.dependencies, minimumDurationMs: 0, consumeClientRateLimit: () => ({ allowed: true }),
    authorizeEligibility: async () => ({ ok: true, authorization: { payload: { allowed: true, requestId: actor.authUserId,
      ...actor, email: "synthetic@example.test", verificationType: "email" } } }),
    readIdentityForRequest: async () => {
      env.PRODUCTION_NATIVE_CAPABILITIES = JSON.stringify(controls());
      return { payload: { ok: true, data: { ...actor, tournament: { id: "2026" }, membership: { active: true } } } };
    },
    authClient: {}, sendOtp: async () => { deliveries++; return {}; }, recordDelivery: async () => ({}),
  };
  const result = await requestMobileNativeOtp({ env, dependencies, request: request("auth/otp/request"),
    input: { method: "email", identifier: "synthetic@example.test", captchaToken: "synthetic-turnstile-challenge-token" } });
  assert.equal(result.status, 202); // Keep enumeration protection for an already admitted request.
  assert.equal(deliveries, 0);
});

export const routeCapabilities = {
  health: "health", "auth/captcha": "auth", "auth/otp/request": "auth", "auth/otp/certify": "certification",
  session: "reads", today: "reads", matches: "reads", "matches/[matchId]": "reads", leaders: "reads", schedule: "reads",
  guide: "reads", passport: "reads", history: "reads", "history/[year]": "reads", records: "reads", odds: "reads",
  "net-skins": "reads", calcutta: "reads", "scoring/current": "reads", "scoring/hole": "scoring", "scoring/finalize": "scoring",
};
test("PN-2 all 21 compiled routes are classified and default-off denies before any external transport", async () => {
  const paths = (await readdir(new URL("app/api/mobile/v1/", root), { recursive: true })).filter((p) => p.endsWith("/route.js")).map((p) => p.replace("/route.js", "")).sort();
  assert.deepEqual(paths, Object.keys(routeCapabilities).sort());
  const saved = { ...process.env }, oldFetch = globalThis.fetch;
  const env = environment(); delete env.PRODUCTION_NATIVE_CAPABILITIES;
  Object.assign(process.env, env); delete process.env.PRODUCTION_NATIVE_CAPABILITIES;
  let transports = 0;
  globalThis.fetch = async () => { transports++; throw new Error("no network in PN-2 tests"); };
  try {
    for (const path of paths) {
      if (path === "health") continue; // Health uses read-only control inspection, tested separately.
      const route = await import(new URL(`app/api/mobile/v1/${path}/route.js`, root));
      const method = route.POST ? "POST" : "GET";
      const req = request(path.replace("[matchId]", "SYNTHETIC-M1").replace("[year]", "2026"), { method,
        headers: { "content-type": "application/json", authorization: "Bearer synthetic", "x-bagger-certification": "synthetic" },
        ...(method === "POST" ? { body: {} } : {}) });
      const response = await route[method](req, { params: Promise.resolve({ year: "2026", matchId: "SYNTHETIC-M1" }) });
      assert.equal(response.status, 503, path);
      assert.equal((await response.json()).error.code, code(routeCapabilities[path]), path);
    }
    assert.equal(transports, 0);
  } finally {
    globalThis.fetch = oldFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("PN-2 web/PWA, Production authority, Preview safeguards and canonical persistence are unchanged", async () => {
  const diff = execFileSync("git", ["diff", "--name-only", base], { cwd: root, encoding: "utf8" }).trim().split("\n");
  assert.ok(diff.every((path) => !path.startsWith("app/") || path.startsWith("app/api/mobile/v1/")));
  assert.ok(diff.every((path) => !path.startsWith("supabase/") && !path.startsWith("ios/")));
  for (const path of ["lib/mobile-native-development-authority.js", "lib/production-cutover-activation-contract.js", "lib/production-cutover-read-control.js",
    "lib/production-cutover-scoring-ingress.js", "lib/production-current-tournament-runtime.js", "lib/participant-identity-supabase.js",
    "lib/scoring-authority-supabase.js", "lib/scoring-participant-authorization.js", "lib/scoring-google-outbox.js", "lib/scorecard-archive-worker.js",
    "lib/mobile-v1-scoring-post-commit.js", "lib/participant-email-otp-mode.js", "lib/production-scoring-operations-server.js"])
    assert.equal(await readFile(new URL(path, root), "utf8"), execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8" }), path);
});
