import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const childMode = process.env.STEP11_6_VERCEL_WAF_EXECUTOR_TEST === "1";

if (!childMode) {
  test("module-owned Vercel WAF executor couples durable dispatch to exact provider readback", () => {
    const child = spawnSync(process.execPath, [process.argv[1]], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        STEP11_6_VERCEL_WAF_EXECUTOR_TEST: "1",
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
          .filter(Boolean).join(" "),
      },
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.deepEqual(JSON.parse(child.stdout), {
      ambiguousResponseRecoveredWithoutSecondPatch: true,
      exactProviderResponseRecorded: true,
      exactReattestationReadback: true,
      exactRestorationReadback: true,
      providerRejectionDurableAndNonReplayable: true,
      routeAndClientBoundaryPinned: true,
      unsupportedPayloadRefused: true,
      wrongCandidateRefused: true,
    });
  });
} else {
  process.env.NODE_TEST_CONTEXT = "child-v8";
  const attestation = await import("../lib/vercel-provider-attestation.js");
  const executor = await import(
    "../lib/production-vercel-waf-provider-executor.js"
  );
  const { PRODUCTION_VERCEL_PROJECT_ID } = await import(
    "../lib/google-service-account-credential-context.js"
  );
  const { PRODUCTION_VERCEL_PROJECT_NAME } = await import(
    "../lib/production-shadow-candidate.js"
  );

  const now = Date.parse("2026-08-27T15:00:00.000Z");
  const teamId = "team_SandbaggerInvitational01";
  const deploymentId = "dpl_WafExecutorCandidate123";
  const commit = "7".repeat(40);
  const alias =
    "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app";
  const immutable =
    "bagger-wafexecutorcandidate-sandbagger-invitational.vercel.app";
  const epochId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const operationRequestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const fenceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const keyPair = generateKeyPairSync("ed25519");
  const privateKey = keyPair.privateKey.export({
    format: "pem", type: "pkcs8",
  }).toString().trim();
  const token = "vercel-waf-executor-test-token-never-log";

  const baseEnv = Object.freeze({
    NODE_TEST_CONTEXT: "child-v8",
    VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
    VERCEL_PROJECT_NAME: PRODUCTION_VERCEL_PROJECT_NAME,
    VERCEL_DEPLOYMENT_ID: deploymentId,
    [attestation.VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
    [executor.PRODUCTION_VERCEL_WAF_EXECUTOR_TOKEN_ENV]: token,
    [executor.PRODUCTION_VERCEL_WAF_EXECUTOR_SIGNING_PRIVATE_KEY_ENV]:
      privateKey,
  });
  const environment = Object.freeze({
    resources: Object.freeze({
      commitSha: commit,
      candidateHostname: alias,
      deploymentHostname: immutable,
      vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
      vercelProjectName: PRODUCTION_VERCEL_PROJECT_NAME,
    }),
  });

  function providerConfig({ version = "10", rules = [] } = {}) {
    const active = {
      version,
      id: `waf-config-${version}`,
      ownerId: teamId,
      firewallEnabled: true,
      ips: [],
      crs: [],
      changes: [{ action: "active.read" }],
      projectKey: "bagger-inv-active",
      updatedAt: new Date(now - 2_000).toISOString(),
      rules: structuredClone(rules),
    };
    return {
      active,
      draft: null,
      versions: [],
      activeVersion: {
        ...structuredClone(active),
        changes: [],
        projectKey: "bagger-inv-version-read",
        updatedAt: new Date(now - 3_000).toISOString(),
      },
    };
  }

  function harness({ patchMode = "accepted", failPostPatchRead = false,
    versionReadMismatch = false } = {}) {
    let epoch = null;
    let phase = "BASELINE";
    let draftRule = null;
    let failedPostPatchRead = false;
    let finalized = 0;
    let reattestations = 0;
    const dispatches = new Map();
    const signedResults = [];
    const requests = [];
    const providerResponse = Object.freeze({
      id: "provider-assigned-waf-rule", status: "pending",
    });
    const dispatchId = (step) => ({
      CRITICAL_RULE_INSERT: "10000000-0000-4000-8000-000000000001",
      CRITICAL_DRAFT_ACTIVATE: "20000000-0000-4000-8000-000000000001",
      BASELINE_VERSION_ACTIVATE: "30000000-0000-4000-8000-000000000001",
    })[step];
    const readback = () => {
      if (phase === "BASELINE") return providerConfig();
      if (phase === "CRITICAL") {
        return providerConfig({ version: "11", rules: [draftRule] });
      }
      const baseline = providerConfig();
      const { version: _version, ...draft } = providerConfig({
        version: "draft-11", rules: [draftRule],
      }).active;
      return {
        ...baseline,
        draft: {
          ...draft,
          changes: [{ action: "rules.insert", id: null }],
        },
      };
    };
    const fetchImpl = async (rawUrl, init = {}) => {
      const url = new URL(rawUrl);
      requests.push({
        method: init.method,
        pathname: url.pathname,
        projectId: url.searchParams.get("projectId"),
        teamId: url.searchParams.get("teamId"),
        authorizationPresent: init.headers.authorization === `Bearer ${token}`,
        body: init.body ? JSON.parse(init.body) : null,
      });
      assert.equal(url.origin, "https://api.vercel.com");
      assert.equal(url.searchParams.get("projectId"), PRODUCTION_VERCEL_PROJECT_ID);
      assert.equal(url.searchParams.get("teamId"), teamId);
      if (init.method === "GET") {
        if (failPostPatchRead && phase === "DRAFT" && !failedPostPatchRead &&
            url.pathname === "/v1/security/firewall/config") {
          failedPostPatchRead = true;
          return new Response(JSON.stringify({ error: "temporary" }), {
            status: 503,
          });
        }
        const currentReadback = readback();
        if (url.pathname === "/v1/security/firewall/config") {
          return new Response(JSON.stringify(currentReadback), { status: 200 });
        }
        assert.equal(url.pathname,
          `/v1/security/firewall/config/${currentReadback.active.version}`);
        const versionReadback = versionReadMismatch
          ? {
            ...currentReadback.activeVersion,
            ownerId: "team_WrongScope123456789",
          }
          : currentReadback.activeVersion;
        return new Response(JSON.stringify(versionReadback), {
          status: 200,
        });
      }
      if (init.method === "PATCH") {
        assert.equal(url.pathname, "/v1/security/firewall/config/draft");
        assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(),
          ["action", "id", "value"]);
        if (patchMode === "rejected" || patchMode === "rejected-non-json") {
          return new Response(patchMode === "rejected-non-json"
            ? "provider rejected this request"
            : JSON.stringify({ error: { code: "forbidden" } }), {
            status: 403,
          });
        }
        const body = JSON.parse(init.body);
        draftRule = { id: providerResponse.id, ...structuredClone(body.value) };
        phase = "DRAFT";
        if (patchMode === "ambiguous") throw new Error("lost response");
        return new Response(JSON.stringify(providerResponse), { status: 200 });
      }
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {});
      if (url.pathname.endsWith("/draft/activate")) {
        phase = "CRITICAL";
      } else {
        assert.ok(url.pathname.endsWith("/10/activate"));
        phase = "BASELINE";
      }
      return new Response(JSON.stringify({ status: "active" }), { status: 200 });
    };
    const inspect = () => epoch === null ? { ok: true, found: false, epochId }
      : {
        ...structuredClone(epoch),
        found: true,
        criticalWindowActive: new Set([
          "ACTIVE_UNBOUND", "FENCE_BOUND", "RESTORE_PENDING",
        ]).has(epoch.status),
        baselineRestored: epoch.status === "BASELINE_RESTORED",
      };
    const control = Object.freeze({
      inspectCriticalWafEpoch: async () => inspect(),
      beginCriticalWafEpoch: async (details) => {
        const evidence = details.evidenceEnvelope.evidence;
        epoch = {
          epochId,
          purpose: evidence.purpose,
          transitionMode: evidence.transitionMode,
          status: "ACTIVATION_PENDING",
          baselineActiveConfigVersion: evidence.configurationVersion,
          baselineActiveConfigEtag: evidence.configurationEtag,
          baselineConfigurationIdentityFingerprint:
            evidence.configurationIdentityFingerprint,
          baselineSourceVersionReadFingerprint:
            evidence.sourceVersionReadFingerprint,
          baselineSemanticConfigurationFingerprint:
            evidence.semanticConfigurationFingerprint,
          baselineOrderedRulesFingerprint: evidence.orderedCustomRulesFingerprint,
          baselineObservationId:
            "40000000-0000-4000-8000-000000000001",
          runOwnedRuleName: evidence.runOwnedRuleName,
          runOwnedRuleNonce: evidence.runOwnedRuleNonce,
          runOwnedRuleFingerprint: evidence.runOwnedRuleFingerprint,
          runOwnedInsertDocumentFingerprint:
            evidence.runOwnedInsertDocumentFingerprint,
          providerAssignedRuleId: "",
          criticalSemanticConfigurationFingerprint: "",
          criticalActiveObservationId: "",
          latestCriticalReattestObservationId: "",
          baselineRestoredObservationId: "",
        };
        return inspect();
      },
      beginCriticalWafDispatch: async (details) => {
        if (dispatches.has(details.dispatchStep)) {
          const existing = dispatches.get(details.dispatchStep);
          return { ...structuredClone(existing), dispatchUsable: false };
        }
        const dispatch = {
          dispatchId: dispatchId(details.dispatchStep),
          dispatchRequestId: details.dispatchRequestId,
          transitionRequestId: details.transitionRequestId,
          requestFingerprint: ({
            CRITICAL_RULE_INSERT: "1",
            CRITICAL_DRAFT_ACTIVATE: "2",
            BASELINE_VERSION_ACTIVATE: "3",
          })[details.dispatchStep].repeat(64),
          dispatchStep: details.dispatchStep,
          status: "RESERVED",
          dispatchUsable: true,
        };
        if (details.dispatchStep === "BASELINE_VERSION_ACTIVATE") {
          epoch.status = "RESTORE_PENDING";
        }
        dispatches.set(details.dispatchStep, dispatch);
        return structuredClone(dispatch);
      },
      markCriticalWafDispatchStarted: async (details) => {
        const dispatch = [...dispatches.values()].find((item) =>
          item.dispatchId === details.dispatchId);
        assert.ok(dispatch);
        assert.equal(dispatch.status, "RESERVED");
        dispatch.status = "PROVIDER_MUTATING";
        return structuredClone(dispatch);
      },
      recordCriticalWafDispatchResult: async (details) => {
        const dispatch = [...dispatches.values()].find((item) =>
          item.dispatchId === details.dispatchId);
        assert.ok(dispatch);
        const signed = details.dispatchResultEnvelope?.evidence ??
          details.wafEvidenceEnvelope?.evidence;
        assert.equal(signed.transitionRequestId, dispatch.transitionRequestId);
        signedResults.push(structuredClone(signed));
        if (details.dispatchResultEnvelope) {
          dispatch.status = signed.outcomeStatus;
          if (signed.outcomeStatus === "TARGET_CONFIRMED") {
            epoch.providerAssignedRuleId = signed.providerAssignedRuleId;
          }
          return { ...structuredClone(dispatch), outcomeStatus: dispatch.status };
        }
        dispatch.status = "TARGET_CONFIRMED";
        const observationId = signed.stage === "CRITICAL_ACTIVE"
          ? "50000000-0000-4000-8000-000000000001"
          : "60000000-0000-4000-8000-000000000001";
        if (signed.stage === "CRITICAL_ACTIVE") {
          epoch.status = "ACTIVE_UNBOUND";
          epoch.criticalSemanticConfigurationFingerprint =
            signed.semanticConfigurationFingerprint;
          epoch.criticalActiveObservationId = observationId;
        } else {
          epoch.status = "BASELINE_RESTORED";
          epoch.baselineRestoredObservationId = observationId;
        }
        return {
          ...structuredClone(dispatch),
          providerResultObservationId: observationId,
        };
      },
      recordCriticalWafReattestation: async (details) => {
        const signed = details.evidenceEnvelope.evidence;
        assert.equal(signed.stage, "CRITICAL_REATTEST");
        assert.equal(signed.wafEpochId, epochId);
        assert.equal(signed.providerAssignedRuleId,
          epoch.providerAssignedRuleId);
        assert.equal(signed.baselineEvidenceId,
          acceptedEvidenceId("baseline-evidence"));
        assert.equal(signed.criticalEvidenceId,
          acceptedEvidenceId("critical-active-evidence"));
        assert.equal(signed.semanticConfigurationFingerprint,
          epoch.criticalSemanticConfigurationFingerprint);
        assert.equal(details.evidenceRequest.transitionRequestId,
          operationRequestId);
        assert.match(details.observationRequestId,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        reattestations += 1;
        signedResults.push(structuredClone(signed));
        epoch.latestCriticalReattestObservationId =
          "70000000-0000-4000-8000-000000000001";
        return {
          ...inspect(),
          criticalReattestObservationId:
            epoch.latestCriticalReattestObservationId,
        };
      },
      finalizeWafBaselineRestore: async (details) => {
        assert.equal(details.fenceId, fenceId);
        assert.equal(details.baselineRestoredObservationId,
          epoch.baselineRestoredObservationId);
        finalized += 1;
        return { ok: true };
      },
    });
    return {
      bindFence: () => {
        assert.equal(epoch.status, "ACTIVE_UNBOUND");
        epoch.status = "FENCE_BOUND";
        epoch.boundFenceId = fenceId;
      },
      control,
      dispatches,
      env: baseEnv,
      fetchImpl,
      finalized: () => finalized,
      now: () => now,
      providerResponse,
      reattestations: () => reattestations,
      requests,
      signedResults,
    };
  }

  const call = (fixture, action, input = {}) =>
    executor.executeProductionVercelWafProviderAction({
      action,
      criticalWafEpochId: epochId,
      operationRequestId,
      quiescePurpose: "REHEARSAL",
      ...input,
    }, {
      authorization: { actorId: "CB01" },
      environment,
      env: fixture.env,
      fetchImpl: fixture.fetchImpl,
      control: fixture.control,
      now: fixture.now,
    });

  function acceptedEvidenceId(label) {
    const chars = createHash("sha256")
      .update(`BAGGER_VERCEL_WAF_EXECUTOR_V1\n${epochId}\n${label}`)
      .digest("hex").slice(0, 32).split("");
    chars[12] = "4";
    chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
    const id = chars.join("");
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-` +
      `${id.slice(16, 20)}-${id.slice(20)}`;
  }

  const accepted = harness();
  const installed = await call(accepted, "INSTALL");
  assert.equal(installed.wafEpoch.criticalWindowActive, true);
  assert.equal(installed.wafEpoch.criticalActiveConfigurationVersion, "11");
  const insertTarget = accepted.signedResults.find((item) =>
    item.dispatchStep === "CRITICAL_RULE_INSERT" &&
      item.outcomeStatus === "TARGET_CONFIRMED");
  assert.equal(insertTarget.providerResponseObserved, true);
  // Independently compare against the public canonical serializer without
  // retaining the credential or raw response in the executor result.
  const { createHash } = await import("node:crypto");
  assert.equal(insertTarget.providerResponseFingerprint,
    createHash("sha256").update(
      attestation.canonicalAttestationJson(accepted.providerResponse),
    ).digest("hex"));
  const beforeReattestRequests = accepted.requests.length;
  await assert.rejects(() => call(accepted, "REATTEST"), {
    code: "STEP11_6_VERCEL_WAF_EXECUTOR_REATTEST_STATE_INVALID",
  });
  assert.equal(accepted.requests.length, beforeReattestRequests);
  accepted.bindFence();
  const reattested = await call(accepted, "REATTEST");
  assert.equal(reattested.providerReadbackVerified, true);
  assert.equal(reattested.providerMutationCoupled, false);
  assert.equal(reattested.idempotent, false);
  assert.equal(reattested.wafEpoch.criticalActiveObservationId,
    "50000000-0000-4000-8000-000000000001");
  assert.equal(reattested.wafEpoch.criticalReattestObservationId,
    "70000000-0000-4000-8000-000000000001");
  assert.equal(reattested.wafEpoch.latestCriticalReattestObservationId,
    "70000000-0000-4000-8000-000000000001");
  assert.equal(accepted.reattestations(), 1);
  assert.equal(accepted.requests.length, beforeReattestRequests + 2);
  assert.equal(accepted.requests.at(-2).pathname,
    "/v1/security/firewall/config");
  assert.equal(accepted.requests.at(-1).pathname,
    "/v1/security/firewall/config/11");
  const reattestRetry = await call(accepted, "REATTEST");
  assert.equal(reattestRetry.idempotent, true);
  assert.equal(reattestRetry.wafEpoch.criticalReattestObservationId,
    reattested.wafEpoch.criticalReattestObservationId);
  assert.equal(accepted.reattestations(), 1);
  assert.equal(accepted.requests.length, beforeReattestRequests + 2);
  const restored = await call(accepted, "RESTORE", { fenceId });
  assert.equal(restored.wafEpoch.baselineRestored, true);
  assert.equal(accepted.finalized(), 1);
  assert.equal(accepted.requests.filter((item) => item.method === "PATCH").length, 1);
  assert.equal(accepted.requests.some((item) =>
    item.method === "POST" && item.pathname.endsWith("/10/activate")), true);
  assert.equal(JSON.stringify([installed, restored]).includes(token), false);

  const ambiguous = harness({ patchMode: "ambiguous", failPostPatchRead: true });
  await assert.rejects(() => call(ambiguous, "INSTALL"), {
    code: "STEP11_6_VERCEL_WAF_EXECUTOR_OUTCOME_AMBIGUOUS",
  });
  assert.equal(ambiguous.dispatches.get("CRITICAL_RULE_INSERT").status,
    "OUTCOME_UNKNOWN");
  const recovered = await call(ambiguous, "INSTALL");
  assert.equal(recovered.wafEpoch.criticalWindowActive, true);
  assert.equal(ambiguous.requests.filter((item) => item.method === "PATCH").length, 1);
  const recoveredInsert = ambiguous.signedResults.findLast((item) =>
    item.dispatchStep === "CRITICAL_RULE_INSERT" &&
      item.outcomeStatus === "TARGET_CONFIRMED");
  assert.equal(recoveredInsert.providerResponseObserved, false);
  assert.equal(recoveredInsert.providerResponseFingerprint, null);

  const rejected = harness({ patchMode: "rejected-non-json" });
  await assert.rejects(() => call(rejected, "INSTALL"), {
    code: "STEP11_6_VERCEL_WAF_EXECUTOR_PROVIDER_REJECTED",
  });
  assert.equal(rejected.dispatches.get("CRITICAL_RULE_INSERT").status,
    "PROVIDER_REJECTED");
  const rejection = rejected.signedResults.find((item) =>
    item.outcomeStatus === "PROVIDER_REJECTED");
  assert.equal(rejection.providerResponseStatus, 403);
  assert.equal(rejection.providerResponseObserved, true);
  await assert.rejects(() => call(rejected, "INSTALL"), {
    code: "STEP11_6_VERCEL_WAF_EXECUTOR_PROVIDER_REJECTED",
  });
  assert.equal(rejected.requests.filter((item) => item.method === "PATCH").length, 1);

  const refused = harness();
  await assert.rejects(() => call(refused, "INSTALL", {
    routingRule: { action: "block" },
  }), { code: "STEP11_6_VERCEL_WAF_EXECUTOR_INPUT_INVALID" });
  assert.equal(refused.requests.length, 0);

  const mismatchedVersionRead = harness({ versionReadMismatch: true });
  await assert.rejects(() => call(mismatchedVersionRead, "INSTALL"), {
    code: "STEP11_6_VERCEL_WAF_EXECUTOR_READBACK_VERSION_MISMATCH",
  });
  assert.equal(mismatchedVersionRead.requests.some((item) =>
    item.method === "PATCH"), false);
  await assert.rejects(() => executor.executeProductionVercelWafProviderAction({
    action: "INSTALL",
    criticalWafEpochId: epochId,
    operationRequestId,
    quiescePurpose: "REHEARSAL",
  }, {
    authorization: { actorId: "CB01" },
    environment,
    env: { ...baseEnv, VERCEL_ENV: "production" },
    fetchImpl: refused.fetchImpl,
    control: refused.control,
    now: refused.now,
  }), { code: "STEP11_6_VERCEL_WAF_EXECUTOR_CANDIDATE_INVALID" });
  assert.equal(refused.requests.length, 0);

  const moduleSource = readFileSync(
    "lib/production-vercel-waf-provider-executor.js", "utf8",
  );
  const routeSource = readFileSync(
    "app/api/admin/step11-6-production-google-writer-fence/route.js", "utf8",
  );
  assert.match(moduleSource, /^import "server-only";/);
  assert.match(routeSource, /install-vercel-waf-provider-fence/);
  assert.match(routeSource, /reattest-vercel-waf-provider-fence/);
  assert.match(routeSource, /restore-vercel-waf-provider-baseline/);
  assert.match(routeSource, /exactWafExecutorInput/);
  assert.match(routeSource, /criticalWafObservationId/);
  assert.match(routeSource, /criticalWafQuiesceStage/);
  assert.doesNotMatch(routeSource, /PRODUCTION_VERCEL_WAF_EXECUTOR_TOKEN/);

  console.log(JSON.stringify({
    ambiguousResponseRecoveredWithoutSecondPatch: true,
    exactProviderResponseRecorded: true,
    exactReattestationReadback: true,
    exactRestorationReadback: true,
    providerRejectionDurableAndNonReplayable: true,
    routeAndClientBoundaryPinned: true,
    unsupportedPayloadRefused: true,
    wrongCandidateRefused: true,
  }));
}
