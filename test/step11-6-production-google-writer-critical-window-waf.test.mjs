import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES_FINGERPRINT,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
  buildProductionGoogleWriterCriticalWindowVercelRuleInsert,
  productionGoogleWriterCriticalWindowProviderRuleContract,
  productionGoogleWriterCriticalWindowRequestDisposition,
  productionGoogleWriterCriticalWindowWafContract,
} from "../lib/production-google-writer-critical-window-waf.js";
import { buildProductionGoogleWriterCriticalWindowWafContract } from
  "../tools/step11-6-operator/generate-historical-production-google-writer-scope-evidence.mjs";

const candidate = Object.freeze({
  candidateAliasOrigin:
    "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app",
  candidateImmutableOrigin:
    "https://bagger-step116signed-sandbagger-invitational.vercel.app",
});
const runOwnedRuleNonce = "11111111-1111-4111-8111-111111111111";
const runOwnedRuleName = `writer-quiesce-${runOwnedRuleNonce}`;

test("generator-backed WAF contract binds exactly two signed candidate hosts", () => {
  const generated = buildProductionGoogleWriterCriticalWindowWafContract(candidate);
  const runtime = productionGoogleWriterCriticalWindowWafContract(candidate);
  assert.deepEqual(generated, runtime);
  assert.equal(generated.candidateControlHosts.hostCount, 2);
  assert.match(generated.candidateControlHosts.hostsFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(generated.denyComplement.conditionGroupCount, 5);
  assert.equal(
    generated.denyComplement.everyOtherNoncanonicalHostPathMethodTupleDenied,
    true,
  );
  assert.deepEqual(generated.exactApplicationAuthenticatedException, {
    hostnames: generated.candidateControlHosts.hostnames,
    hostCount: 2,
    hostsFingerprint: generated.candidateControlHosts.hostsFingerprint,
    requestPath: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
    requestMethod: "POST",
    applicationAuthenticationRequired: true,
    providerSignedCandidateAliasAndImmutableOriginsRequired: true,
  });
  assert.equal(
    generated.denyComplement
      .canonicalApexMutationAndSafeMethodWriterTuplesDenied,
    true,
  );
  assert.deepEqual(
    generated.canonicalApexContainment.allowedSafeMethods,
    PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
  );
  assert.deepEqual(
    generated.canonicalApexContainment
      .exhaustiveHistoricalSafeMethodWriterRoutes,
    PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES,
  );
  assert.equal(
    generated.canonicalApexContainment
      .exhaustiveHistoricalSafeMethodWriterRoutesFingerprint,
    PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES_FINGERPRINT,
  );
});

test("provider rule contract is one run-owned top-precedence five-group DENY rule", () => {
  const rule = productionGoogleWriterCriticalWindowProviderRuleContract({
    ...candidate,
    runOwnedRuleName,
  });
  assert.equal(rule.ownership, "RUN_OWNED_TEMPORARY");
  assert.equal(rule.precedence, 0);
  assert.equal(rule.active, true);
  assert.equal(rule.action, "DENY");
  assert.equal(rule.conditionGroupCount, 5);
  assert.equal(rule.conditionGroups.length, 5);
  assert.deepEqual(rule.conditionGroups.map((group) => group.purpose), [
    "DENY_EVERY_NONCANDIDATE_NONCANONICAL_HOST",
    "DENY_CANDIDATE_HOST_ON_EVERY_OTHER_PATH",
    "DENY_CANDIDATE_HOST_WITH_EVERY_OTHER_METHOD",
    "DENY_CANONICAL_APEX_EVERY_NONSAFE_METHOD",
    "DENY_CANONICAL_APEX_EXHAUSTIVE_SAFE_METHOD_WRITER_PATHS",
  ]);
  assert.match(rule.ruleFingerprint, /^[0-9a-f]{64}$/);
  assert.throws(() => productionGoogleWriterCriticalWindowProviderRuleContract({
    ...candidate,
    runOwnedRuleName: "",
  }), (error) =>
    error.code === "STEP11_6_WRITER_CRITICAL_WINDOW_WAF_SCOPE_INVALID");
});

test("Vercel rules.insert generator uses a null ID and binds the run-owned name", () => {
  const generated = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
    ...candidate,
    runOwnedRuleName,
    runOwnedRuleNonce,
  });
  assert.equal(generated.body.action, "rules.insert");
  assert.equal(generated.body.id, null);
  assert.equal(generated.body.value.name, runOwnedRuleName);
  assert.equal(generated.body.value.active, true);
  assert.deepEqual(generated.body.value.action, { mitigate: { action: "deny" } });
  assert.equal(generated.body.value.conditionGroup.length, 5);
  assert.deepEqual(
    generated.body.value.conditionGroup.flatMap((group) =>
      group.conditions.filter((condition) => condition.type === "host")
    ).length,
    6,
  );
  assert.equal(
    generated.body.value.conditionGroup.flatMap((group) => group.conditions)
      .some((condition) => condition.type === "hostname"),
    false,
  );
  assert.match(generated.runOwnedRuleFingerprint, /^[0-9a-f]{64}$/);
  assert.match(generated.runOwnedInsertDocumentFingerprint, /^[0-9a-f]{64}$/);
  assert.throws(() => buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
    ...candidate,
    runOwnedRuleName: "writer-quiesce-without-the-bound-nonce",
    runOwnedRuleNonce,
  }), (error) =>
    error.code === "STEP11_6_WRITER_CRITICAL_WINDOW_WAF_SCOPE_INVALID");
});

test("only exact candidate-host control-path POST reaches application authentication", () => {
  const contract = productionGoogleWriterCriticalWindowWafContract(candidate);
  for (const hostname of contract.candidateControlHosts.hostnames) {
    assert.equal(productionGoogleWriterCriticalWindowRequestDisposition({
      hostname,
      path: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
      method: "POST",
    }, candidate), "APPLICATION_AUTHENTICATED_CONTROL_POST_EXCEPTION");
  }

  const denied = [
    {
      hostname: "unattested-preview.vercel.app",
      path: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
      method: "POST",
    },
    {
      hostname: contract.candidateControlHosts.candidateAliasHostname,
      path: "/api/admin/not-the-control-path",
      method: "POST",
    },
    ...["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"].map((method) => ({
      hostname: contract.candidateControlHosts.candidateImmutableHostname,
      path: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
      method,
    })),
    ...["GET", "HEAD", "OPTIONS"].map((method) => ({
      hostname: "other-preview.vercel.app",
      path: "/_next/static/chunk.js",
      method,
    })),
  ];
  for (const request of denied) {
    assert.equal(
      productionGoogleWriterCriticalWindowRequestDisposition(request, candidate),
      "DENY",
      JSON.stringify(request),
    );
  }
});

test("candidate scope fails closed on one, duplicate, canonical, or non-Vercel hosts", () => {
  for (const changed of [{
    ...candidate,
    candidateImmutableOrigin: "",
  }, {
    ...candidate,
    candidateImmutableOrigin: candidate.candidateAliasOrigin,
  }, {
    ...candidate,
    candidateAliasOrigin: "https://baggerinv.com",
  }, {
    ...candidate,
    candidateImmutableOrigin: "https://example.com",
  }]) {
    assert.throws(
      () => productionGoogleWriterCriticalWindowWafContract(changed),
      (error) => error.code === "STEP11_6_WRITER_CRITICAL_WINDOW_WAF_SCOPE_INVALID",
    );
  }
});

test("canonical apex admits safe reads only outside exhaustive writer paths", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "CONNECT"]) {
    assert.equal(productionGoogleWriterCriticalWindowRequestDisposition({
      hostname: "baggerinv.com",
      path: "/api/scoring/current",
      method,
    }, candidate), "DENY");
  }
  for (const path of [
    "/api/admin/cms",
    "/api/cron/round-scorecards-archive",
    "/api/scoring/matches/match-123",
    "/api/tournament-guide/",
  ]) {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(productionGoogleWriterCriticalWindowRequestDisposition({
        hostname: "baggerinv.com",
        path,
        method,
      }, candidate), "DENY", `${method} ${path}`);
    }
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(productionGoogleWriterCriticalWindowRequestDisposition({
      hostname: "baggerinv.com",
      path: "/api/health",
      method,
    }, candidate), "APEX_SAFE_READ_ALLOWED_DURING_GLOBAL_QUIESCE");
  }
});
