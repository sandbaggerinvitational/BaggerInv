import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_WRITER_FENCE_CANDIDATE_BRANCH,
  PRODUCTION_WRITER_FENCE_CONTROL_PATH,
  productionWriterFenceCandidateControlRequestEnvironment,
} from "../lib/production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { productionGoogleWriterCriticalWindowRequestDisposition } from
  "../lib/production-google-writer-critical-window-waf.js";

const branchHostname =
  "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app";
const immutableHostname =
  "bagger-inv-f5d8sj2ad-sandbagger-invitational.vercel.app";
const commitSha = "a".repeat(40);
const deploymentId = "dpl_CandidateControl123";

const candidateEnv = Object.freeze({
  VERCEL_ENV: "preview",
  VERCEL_URL: immutableHostname,
  VERCEL_BRANCH_URL: branchHostname,
  VERCEL_DEPLOYMENT_ID: deploymentId,
  VERCEL_GIT_COMMIT_REF: PRODUCTION_WRITER_FENCE_CANDIDATE_BRANCH,
  VERCEL_GIT_COMMIT_SHA: commitSha,
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: branchHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID:
    PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "production-server-secret-never-serialized",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:
    "production-browser-publishable-key",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY:
    "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET:
    "production-auth-rate-limit-only-secret",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
});

function request(hostname, {
  method = "POST",
  origin = `https://${hostname}`,
  path = PRODUCTION_WRITER_FENCE_CONTROL_PATH,
  protocol = "https",
  forwardedProto = "https",
  host = hostname,
  forwardedHost = hostname,
} = {}) {
  const headers = new Headers({
    host,
    "x-forwarded-host": forwardedHost,
    "x-forwarded-proto": forwardedProto,
  });
  if (origin !== null) headers.set("origin", origin);
  return {
    method,
    url: `${protocol}://${hostname}${path}`,
    headers,
    cookies: { get: () => undefined, getAll: () => [] },
  };
}

test("candidate control admits exactly the signed branch and immutable POST origins", () => {
  for (const hostname of [branchHostname, immutableHostname]) {
    const state = productionWriterFenceCandidateControlRequestEnvironment(
      request(hostname),
      candidateEnv,
    );
    assert.equal(state.allowed, true, hostname);
    assert.equal(state.runtimeMode, "PROJECT_PREVIEW_CANDIDATE");
    assert.equal(state.deploymentId, deploymentId);
    assert.equal(productionGoogleWriterCriticalWindowRequestDisposition({
      hostname,
      method: "POST",
      path: PRODUCTION_WRITER_FENCE_CONTROL_PATH,
    }, {
      candidateAliasOrigin: `https://${branchHostname}`,
      candidateImmutableOrigin: `https://${immutableHostname}`,
    }), "APPLICATION_AUTHENTICATED_CONTROL_POST_EXCEPTION");
  }
});

test("candidate control rejects every host, method, path, origin, and transport drift", () => {
  const cases = [
    request("baggerinv.com"),
    request("www.baggerinv.com"),
    request("unlisted-preview.vercel.app"),
    request(branchHostname, { method: "GET" }),
    request(branchHostname, { method: "HEAD" }),
    request(branchHostname, { method: "OPTIONS" }),
    request(branchHostname, { path: "/api/admin/other" }),
    request(branchHostname, { path: `${PRODUCTION_WRITER_FENCE_CONTROL_PATH}?x=1` }),
    request(branchHostname, { origin: null }),
    request(branchHostname, { origin: `https://${immutableHostname}` }),
    request(branchHostname, { host: immutableHostname }),
    request(branchHostname, { forwardedHost: immutableHostname }),
    request(branchHostname, { protocol: "http" }),
    request(branchHostname, { forwardedProto: "http" }),
  ];
  for (const candidateRequest of cases) {
    assert.equal(
      productionWriterFenceCandidateControlRequestEnvironment(
        candidateRequest,
        candidateEnv,
      ).allowed,
      false,
      candidateRequest.url,
    );
  }
});

test("candidate control rejects SHA, branch, deployment, project, and Production resource drift", () => {
  const cases = [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
    { VERCEL_DEPLOYMENT_ID: "" },
    { VERCEL_PROJECT_ID: "prj_wrong" },
    { VERCEL_PROJECT_NAME: "another-project" },
    { PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" },
    { PRODUCTION_SUPABASE_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" },
    { GOOGLE_SHEETS_ID: "preview-workbook" },
    { SCORING_AUTHORITY: "supabase" },
  ];
  for (const drift of cases) {
    const state = productionWriterFenceCandidateControlRequestEnvironment(
      request(branchHostname),
      { ...candidateEnv, ...drift },
    );
    assert.equal(state.allowed, false, JSON.stringify(drift));
  }
});

test("dedicated candidate control authorization uses only Production Supabase CB01", () => {
  const moduleUrl = new URL(
    "../lib/preview-director-authorization.js",
    import.meta.url,
  ).href;
  const script = `
    const auth = await import(${JSON.stringify(moduleUrl)});
    const branch = ${JSON.stringify(branchHostname)};
    const immutable = ${JSON.stringify(immutableHostname)};
    const path = ${JSON.stringify(PRODUCTION_WRITER_FENCE_CONTROL_PATH)};
    const makeRequest = (host, overrides = {}) => {
      const method = overrides.method || "POST";
      const requestPath = overrides.path || path;
      const headers = new Headers({
        host: overrides.host || host,
        "x-forwarded-host": overrides.forwardedHost || host,
        "x-forwarded-proto": overrides.forwardedProto || "https",
        origin: overrides.origin || "https://" + host,
      });
      return { method, url: "https://" + host + requestPath, headers,
        cookies: { get: () => undefined, getAll: () => [] } };
    };
    let claims = 0;
    let entitlements = 0;
    let passports = 0;
    const active = {
      verifyClaims: async () => {
        claims += 1;
        return { status: "active", claims: {
          sub: "00000000-0000-4000-8000-000000000001",
        } };
      },
      readEntitlement: async () => {
        entitlements += 1;
        return { payload: { ok: true, found: true, active: true,
          status: "ACTIVE", role: "DIRECTOR", tournamentId: "2026",
          directorPlayerId: "CB01", revision: 7 } };
      },
      inspectPassport: async () => {
        passports += 1;
        return { status: "active", identity: { actor: { id: "CB01" } } };
      },
    };
    const accepted = [];
    for (const host of [branch, immutable]) {
      const result = await auth
        .authorizeProductionWriterFenceDirectorCandidateControl(
          makeRequest(host), active,
        );
      const actor = auth.assertProductionWriterFenceDirectorAuthorization(result);
      accepted.push({ status: result.status, source: result.source,
        actorId: actor.actorId, frozen: Object.isFrozen(result) &&
          Object.isFrozen(result.identity) });
      let cloneRejected = false;
      try { auth.assertProductionWriterFenceDirectorAuthorization({ ...result }); }
      catch { cloneRejected = true; }
      accepted[accepted.length - 1].cloneRejected = cloneRejected;
      try { result.identity.actor.id = "ATTACKER"; } catch {}
      accepted[accepted.length - 1].actorAfterMutation = result.identity.actor.id;
    }
    const beforeInvalid = { claims, entitlements, passports };
    const invalid = [];
    for (const bad of [
      makeRequest("baggerinv.com"),
      makeRequest(branch, { method: "GET" }),
      makeRequest(branch, { path: "/api/admin/other" }),
      makeRequest(branch, { origin: "https://evil.example" }),
      makeRequest(branch, { forwardedProto: "http" }),
    ]) invalid.push((await auth
      .authorizeProductionWriterFenceDirectorCandidateControl(bad, active)).status);
    const priorSha = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "b".repeat(40);
    invalid.push((await auth.authorizeProductionWriterFenceDirectorCandidateControl(
      makeRequest(branch), active,
    )).status);
    process.env.VERCEL_GIT_COMMIT_SHA = priorSha;
    const afterInvalid = { claims, entitlements, passports };
    const inactive = await auth.authorizeProductionWriterFenceDirectorCandidateControl(
      makeRequest(branch), {
        verifyClaims: async () => {
          claims += 1;
          return { status: "inactive", claims: null };
        },
        readEntitlement: active.readEntitlement,
        inspectPassport: active.inspectPassport,
      },
    );
    const wrongDirector = await auth
      .authorizeProductionWriterFenceDirectorCandidateControl(
        makeRequest(branch), {
          ...active,
          readEntitlement: async () => {
            entitlements += 1;
            return { payload: { ok: true, found: true, active: true,
              status: "ACTIVE", role: "DIRECTOR", tournamentId: "2026",
              directorPlayerId: "PREVIEW-DIR", revision: 8 } };
          },
        },
      );
    let genericRejected = false;
    const generic = await auth.authorizePreviewDirector({
      request: makeRequest(branch), env: process.env, allowBootstrap: false,
      dependencies: active,
    });
    try { auth.assertProductionWriterFenceDirectorAuthorization(generic); }
    catch { genericRejected = true; }
    process.stdout.write(JSON.stringify({ accepted, beforeInvalid, afterInvalid,
      inactive: inactive.status, wrongDirector: wrongDirector.status,
      genericRejected, claims, entitlements, passports }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: { ...process.env, ...candidateEnv, NODE_TEST_CONTEXT: "child-v8" },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result.accepted, [branchHostname, immutableHostname].map(() => ({
    status: "active",
    source: "production-shadow-entitlement",
    actorId: "CB01",
    frozen: true,
    cloneRejected: true,
    actorAfterMutation: "CB01",
  })));
  assert.deepEqual(result.beforeInvalid, { claims: 2, entitlements: 2, passports: 0 });
  assert.deepEqual(result.afterInvalid, result.beforeInvalid,
    "invalid request scope reached claims or entitlement RPC work");
  assert.equal(result.inactive, "inactive");
  assert.equal(result.wrongDirector, "forbidden");
  assert.equal(result.genericRejected, true);
  assert.equal(result.passports, 0);
});

test("candidate-control dependency injection is unavailable outside the test runtime", () => {
  const moduleUrl = new URL(
    "../lib/preview-director-authorization.js",
    import.meta.url,
  ).href;
  const script = `
    const auth = await import(${JSON.stringify(moduleUrl)});
    const host = ${JSON.stringify(branchHostname)};
    const headers = new Headers({ host, "x-forwarded-host": host,
      "x-forwarded-proto": "https", origin: "https://" + host });
    const request = { method: "POST", url: "https://" + host +
      ${JSON.stringify(PRODUCTION_WRITER_FENCE_CONTROL_PATH)}, headers,
      cookies: { get: () => undefined, getAll: () => [] } };
    try {
      await auth.authorizeProductionWriterFenceDirectorCandidateControl(request, {
        verifyClaims: async () => ({ status: "active", claims: {} }),
      });
      process.stdout.write(JSON.stringify({ accepted: true }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ accepted: false, code: error.code }));
    }
  `;
  const env = { ...process.env, ...candidateEnv };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", env },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    accepted: false,
    code: "STEP11_6_WRITER_FENCE_AUTHORIZATION_DEPENDENCY_INJECTION_FORBIDDEN",
  });
});

test("route dispatch has an exact Step 11.6 ACL action map and no legacy fallback", async () => {
  const route = await readFile(new URL(
    "../app/api/admin/step11-6-production-google-writer-fence/route.js",
    import.meta.url,
  ), "utf8");
  for (const [external, internal] of [
    ["inspect-drive-acl-rehearsal", "inspect"],
    ["downgrade-drive-acl-rehearsal", "install"],
    ["restore-drive-acl-rehearsal", "abort-install"],
  ]) assert.match(route, new RegExp(`\\[\\"${external}\\", \\"${internal}\\"\\]`));
  assert.doesNotMatch(route, /executeProductionGoogleWriterFenceRehearsal/);
  for (const oldAction of ["inspect", "rehearse", "restore"]) {
    assert.doesNotMatch(route, new RegExp(`\\[\\"${oldAction}\\"`));
  }
  const actionValidation = route.indexOf("!REHEARSAL_ACL_ACTIONS.has(action)");
  const dependencyCreation = route.indexOf("const dependencies =", actionValidation);
  const executorCall = route.indexOf("executeProductionGoogleWriterProviderFence(",
    dependencyCreation);
  assert.ok(actionValidation >= 0);
  assert.ok(actionValidation < dependencyCreation);
  assert.ok(dependencyCreation < executorCall);
  assert.match(route, /quiescePurpose: "REHEARSAL"/);
  assert.ok(route.indexOf("authorizeProductionWriterFenceDirectorCandidateControl") <
    route.indexOf("request\.json\(\)"));
});
