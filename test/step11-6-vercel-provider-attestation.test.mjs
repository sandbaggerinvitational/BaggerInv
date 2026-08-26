import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  collectVercelDeploymentScope,
  createVercelProviderAttestation,
  normalizeVercelEnvironmentScope,
  normalizeVercelFirewallConfiguration,
  pinnedEd25519PublicKeyBase64,
  verifyVercelProviderAttestation,
  VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV,
  VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
} from "../lib/vercel-provider-attestation.js";
import { productionLegacyDeploymentInventory } from
  "../lib/production-google-writer-fence-quiesce.js";
import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
} from "../lib/production-google-credential-confinement.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from
  "../lib/google-service-account-credential-context.js";
import {
  createVercelCliReadApi,
  installKeychainAttestationSigner,
  readKeychainAttestationPrivateKey,
  VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
  VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
} from
  "../tools/step11-6-operator/vercel-provider-attester.mjs";

const teamId = "team_SandbaggerInvitational01";
const ruleId = "writer-quiesce-rule";
const candidateId = "dpl_Step116AttestedCandidate01";
const candidateSha = "7".repeat(40);
const candidateAlias =
  "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app";
const candidateImmutable =
  "https://bagger-step116signed-sandbagger-invitational.vercel.app";
const postFreezeId = "dpl_PostFreezeStep116Preview01";
const postFreezeSha = candidateSha;
const postFreezeOrigin =
  "https://bagger-postfreezesigned-sandbagger-invitational.vercel.app";
const capturedLater = "2026-08-26T16:10:00.000Z";
const now = Date.parse("2026-08-26T16:20:00.000Z");

function request({
  stage = "BEGIN",
  purpose = "REHEARSAL",
  target = purpose === "CUTOVER" ? "PRODUCTION" : "PREVIEW",
  requestId = "11111111-1111-4111-8111-111111111111",
  challengeId = "33333333-3333-4333-8333-333333333333",
} = {}) {
  return {
    schemaVersion: VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
    challengeId,
    challengeRequestFingerprint: "9".repeat(64),
    requestId,
    stage,
    purpose,
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    candidateDeploymentId: candidateId,
    candidateCommitSha: candidateSha,
    candidateDeploymentTarget: target,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
    routingRuleId: ruleId,
    routingRuleConfigVersion: "17",
  };
}

function firewall({ active = true, action = "deny", version = "17" } = {}) {
  const config = {
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    version,
    etag: "config-etag-17",
    firewallEnabled: true,
    rules: [{
      id: ruleId,
      active,
      conditionGroup: [{
        conditions: [
          {
            type: "path",
            op: "eq",
            neg: true,
            value: "/api/admin/step11-6-production-google-writer-fence",
          },
          {
            type: "method",
            op: "inc",
            neg: true,
            value: ["OPTIONS", "GET", "HEAD"],
          },
        ],
      }],
      action: { mitigate: { action } },
    }],
  };
  return { active: config, draft: null, versions: [config] };
}

function rawDeployment(tuple, { createdAt = "2026-08-20T00:00:00.000Z" } = {}) {
  const [uid, sha, origin, scope, status] = tuple;
  const feature = scope === "FEATURE_PREVIEW" ||
    scope === "CUTOVER_PRODUCTION_CANDIDATE";
  return {
    uid,
    url: new URL(origin).hostname,
    target: scope === "FEATURE_PREVIEW" ? "preview" : "production",
    readyState: status === "BLOCKED" ? "CANCELED" : status,
    createdAt,
    meta: {
      ...(sha ? { githubCommitSha: sha } : {}),
      githubCommitRef: feature ? "feature/mock-tournament-qa-integration" : "main",
    },
  };
}

function liveTuples(selectedRequest, { includePostFreeze = true } = {}) {
  const candidateScope = selectedRequest.candidateDeploymentTarget === "PRODUCTION"
    ? "CUTOVER_PRODUCTION_CANDIDATE" : "FEATURE_PREVIEW";
  return [
    ...productionLegacyDeploymentInventory().recordTuples.map((tuple) => [...tuple]),
    ...(includePostFreeze ? [[
      postFreezeId, postFreezeSha, postFreezeOrigin,
      "FEATURE_PREVIEW", "READY", "GIT",
    ]] : []),
    [candidateId, candidateSha, candidateImmutable, candidateScope, "READY", "GIT"],
  ].sort((left, right) => {
    const a = `${left[0]}\n${left[2]}`;
    const b = `${right[0]}\n${right[2]}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function provider(selectedRequest, options = {}) {
  const tuples = liveTuples(selectedRequest, options);
  const deployments = tuples.map((tuple) => rawDeployment(tuple, {
    createdAt: tuple[0] === postFreezeId || tuple[0] === candidateId
      ? capturedLater : "2026-08-20T00:00:00.000Z",
  }));
  const paths = [];
  const secretValues = ["never-return-this-private-key", "sb_secret_never-return-this"];
  const candidateTarget = selectedRequest.candidateDeploymentTarget === "PRODUCTION"
    ? "production" : "preview";
  const candidateBranch = candidateTarget === "preview"
    ? "feature/mock-tournament-qa-integration" : null;
  const requiredEnvironmentNames = [
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "PRODUCTION_GOOGLE_PRIVATE_KEY",
    "GOOGLE_SHEETS_ID",
    "PRODUCTION_SUPABASE_SECRET_KEY",
    "PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ED25519_PUBLIC_KEY",
    "PRODUCTION_VERCEL_PROVIDER_ATTESTATION_TEAM_ID",
  ];
  const readApi = async (path) => {
    paths.push(path);
    if (path.startsWith("/v1/security/firewall/config?")) return firewall(options.firewall);
    if (path.startsWith("/v9/projects/")) return {
      envs: [
        ...requiredEnvironmentNames.map((key, index) => ({
          key,
          target: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].includes(key)
            ? ["production", "preview"] : [candidateTarget],
          gitBranch: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].includes(key)
            ? null : candidateBranch,
          value: index % 2 === 0 ? secretValues[0] : secretValues[1],
        })),
        { key: "UNRELATED_PUBLIC_SETTING", target: ["production"], value: "ignored" },
      ],
    };
    if (path.startsWith("/v6/deployments?")) {
      const cursor = Number(new URL(`https://local${path}`).searchParams.get("until") || 0);
      const page = deployments.slice(cursor, cursor + 100);
      const next = cursor + page.length < deployments.length ? cursor + page.length : null;
      return { deployments: page, pagination: { next } };
    }
    throw new Error(`Unexpected path: ${path}`);
  };
  return { readApi, paths, secretValues, tuples };
}

function keys() {
  return generateKeyPairSync("ed25519");
}

test("local attester exhausts deployment pagination, accepts additive scope, and redacts values", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const scope = await collectVercelDeploymentScope(fixture.readApi, selectedRequest);
  assert.equal(scope.retainedRecordCount, 1140);
  assert.equal(scope.liveRecordCount, 1142);
  assert.equal(scope.liveRecords.length, 1142);
  assert.equal(scope.paginationComplete, true);
  assert.equal(scope.pageCount, 12);
  assert.equal(scope.liveRecords.filter((tuple) => tuple[1] === null).length, 1,
    "only the provider-proven non-executable blocked deployment retains a null SHA");
  assert.ok(fixture.paths.filter((path) => path.startsWith("/v6/deployments?")).length === 12);
  assert.ok(fixture.paths.some((path) => path.includes("until=1100")));

  const environment = normalizeVercelEnvironmentScope(await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  ));
  assert.equal(environment.records.length, 8);
  assert.equal(environment.records.filter((record) =>
    ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].includes(record[0]) &&
    record[1].join(",") === "preview,production" && record[2] === null).length, 2);
  assert.ok(environment.records.filter((record) =>
    !["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].includes(record[0]))
    .every((record) => record[1][0] === "preview" &&
      record[2] === "feature/mock-tournament-qa-integration"));
  assert.ok(fixture.secretValues.every((secret) =>
    !JSON.stringify(environment).includes(secret)));
});

test("signed BEGIN and independently signed FINALIZE attestations bind Preview scope", async () => {
  const keyPair = keys();
  const beginRequest = request();
  const beginFixture = provider(beginRequest);
  const begin = await createVercelProviderAttestation({
    request: beginRequest,
    privateKey: keyPair.privateKey,
    readApi: beginFixture.readApi,
    now,
    attestationId: "22222222-2222-4222-8222-222222222222",
  });
  const env = {
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      pinnedEd25519PublicKeyBase64(keyPair.publicKey),
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
  };
  const verifiedBegin = verifyVercelProviderAttestation(begin, {
    env,
    request: beginRequest,
    expectedRoutingRuleRevision: "17",
    now: now + 30_000,
  });
  assert.equal(verifiedBegin.signatureVerified, true);
  assert.equal(verifiedBegin.stage, "BEGIN");
  assert.equal(verifiedBegin.candidateDeploymentTarget, "PREVIEW");
  assert.equal(verifiedBegin.liveOriginInventoryCount, 1142);
  assert.equal(verifiedBegin.routingRulePendingDraftChangeCount, 0);
  assert.equal(verifiedBegin.credentialConfinementEvidenceSchema,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA);
  assert.equal(verifiedBegin.credentialConfinementRecordCount,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT);
  assert.equal(verifiedBegin.credentialConfinementRecordsFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT);
  assert.equal(verifiedBegin.credentialConfinementEvidenceFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT);

  const finalizeRequest = request({
    stage: "FINALIZE",
    requestId: "44444444-4444-4444-8444-444444444444",
    challengeId: "66666666-6666-4666-8666-666666666666",
  });
  const finalize = await createVercelProviderAttestation({
    request: finalizeRequest,
    privateKey: keyPair.privateKey,
    readApi: provider(finalizeRequest).readApi,
    now: now + 310_000,
    attestationId: "55555555-5555-4555-8555-555555555555",
  });
  const verifiedFinalize = verifyVercelProviderAttestation(finalize, {
    env,
    request: finalizeRequest,
    expectedRoutingRuleRevision: "17",
    now: now + 320_000,
  });
  assert.equal(verifiedFinalize.stage, "FINALIZE");
  assert.notEqual(verifiedFinalize.attestationId, verifiedBegin.attestationId);
  assert.notEqual(verifiedFinalize.challengeId, verifiedBegin.challengeId);
  assert.notEqual(verifiedFinalize.attestationFingerprint,
    verifiedBegin.attestationFingerprint);
  assert.ok(beginFixture.secretValues.every((secret) =>
    !JSON.stringify(begin).includes(secret)));
  await assert.rejects(() => createVercelProviderAttestation({
    request: beginRequest,
    privateKey: keyPair.privateKey,
    readApi: beginFixture.readApi,
    now,
    attestationId: beginRequest.challengeId,
  }), (error) => error.code === "STEP11_6_VERCEL_ATTESTATION_ID_INVALID");
});

test("CUTOVER attestation binds a Production-target feature candidate without relabeling main", async () => {
  const selectedRequest = request({ purpose: "CUTOVER", target: "PRODUCTION" });
  const fixture = provider(selectedRequest);
  const keyPair = keys();
  const envelope = await createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keyPair.privateKey,
    readApi: fixture.readApi,
    now,
  });
  assert.equal(envelope.attestation.candidateDeploymentTarget, "PRODUCTION");
  assert.ok(envelope.attestation.liveOriginInventoryRecords.some((tuple) =>
    tuple[0] === candidateId && tuple[3] === "CUTOVER_PRODUCTION_CANDIDATE"));
  const verified = verifyVercelProviderAttestation(envelope, {
    env: {
      [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
        pinnedEd25519PublicKeyBase64(keyPair.publicKey),
      [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
    },
    request: selectedRequest,
    expectedRoutingRuleRevision: "17",
    now: now + 10_000,
  });
  assert.equal(verified.candidateDeploymentTarget, "PRODUCTION");
});

test("tamper, stale proof, wrong purpose/target, firewall drift, and deployment drift fail closed", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const keyPair = keys();
  const envelope = await createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keyPair.privateKey,
    readApi: fixture.readApi,
    now,
  });
  const env = {
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      pinnedEd25519PublicKeyBase64(keyPair.publicKey),
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
  };
  const tampered = structuredClone(envelope);
  tampered.attestation.liveOriginInventoryCount += 1;
  assert.throws(() => verifyVercelProviderAttestation(tampered, {
    env, request: selectedRequest, expectedRoutingRuleRevision: "17", now,
  }), (error) => error.code === "STEP11_6_VERCEL_ATTESTATION_SIGNATURE_INVALID");
  assert.throws(() => verifyVercelProviderAttestation(envelope, {
    env, request: selectedRequest, expectedRoutingRuleRevision: "17",
    now: now + 121_000,
  }), (error) => error.code === "STEP11_6_VERCEL_ATTESTATION_SCOPE_INVALID");
  await assert.rejects(() => collectVercelDeploymentScope(
    async () => ({ deployments: [], pagination: { next: null } }),
    request({ purpose: "CUTOVER", target: "PREVIEW" }),
  ),
    (error) => error.code === "STEP11_6_VERCEL_ATTESTATION_REQUEST_INVALID");
  assert.throws(() => normalizeVercelFirewallConfiguration(
    firewall({ active: false }), selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const draftOnly = firewall();
  draftOnly.draft = draftOnly.active;
  draftOnly.active = null;
  assert.throws(() => normalizeVercelFirewallConfiguration(
    draftOnly, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const mismatchedActive = firewall({ version: "18" });
  assert.throws(() => normalizeVercelFirewallConfiguration(
    mismatchedActive, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RESPONSE_INVALID");

  const pendingDraft = firewall();
  pendingDraft.draft = { changes: [{ op: "update" }] };
  assert.throws(() => normalizeVercelFirewallConfiguration(
    pendingDraft, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_DRAFT_PENDING");

  const emptyDraft = firewall();
  emptyDraft.draft = { changes: [] };
  assert.equal(normalizeVercelFirewallConfiguration(
    emptyDraft, selectedRequest,
  ).pendingDraftChangeCount, 0);

  const missingCandidate = provider(selectedRequest);
  const originalReader = missingCandidate.readApi;
  await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
    const payload = await originalReader(path);
    if (path.startsWith("/v6/deployments?")) {
      payload.deployments = payload.deployments.filter((item) => item.uid !== candidateId);
    }
    return payload;
  }, selectedRequest), (error) => error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
});

test("a duplicate unscoped Preview credential record fails closed even beside an exact branch record", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  assert.throws(() => normalizeVercelEnvironmentScope({
    envs: [
      ...exactPayload.envs,
      {
        key: "PRODUCTION_GOOGLE_PRIVATE_KEY",
        target: ["preview"],
        gitBranch: null,
      },
    ],
  }, { request: selectedRequest }), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE");
});

test("local Vercel CLI reader is GET-only, endpoint allowlisted, and never accepts a token", async () => {
  const calls = [];
  const readApi = createVercelCliReadApi({
    vercelBinary: "/opt/vercel/bin/vercel",
    execFileImpl: async (...args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ deployments: [], pagination: { next: null } }) };
    },
  });
  await readApi(`/v6/deployments?projectId=${PRODUCTION_VERCEL_PROJECT_ID}&teamId=${teamId}`);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ["api",
    `/v6/deployments?projectId=${PRODUCTION_VERCEL_PROJECT_ID}&teamId=${teamId}`]);
  assert.ok(!JSON.stringify(calls).toLowerCase().includes("token"));
  await assert.rejects(() => readApi("/v13/deployments/dpl_x"),
    (error) => error.code === "STEP11_6_VERCEL_ATTESTER_ENDPOINT_FORBIDDEN");

  const defaultCalls = [];
  const defaultReader = createVercelCliReadApi({
    execFileImpl: async (...args) => {
      defaultCalls.push(args);
      return { stdout: JSON.stringify({ deployments: [], pagination: { next: null } }) };
    },
  });
  const defaultPath =
    `/v6/deployments?projectId=${PRODUCTION_VERCEL_PROJECT_ID}&teamId=${teamId}`;
  await defaultReader(defaultPath);
  assert.equal(defaultCalls[0][0], "npx");
  assert.deepEqual(defaultCalls[0][1], [
    "--no-install", "vercel", "api", defaultPath,
  ]);
});

test("deployment pagination loops/nontermination and unexpected branches fail closed", async () => {
  const selectedRequest = request();
  let calls = 0;
  await assert.rejects(() => collectVercelDeploymentScope(async () => {
    calls += 1;
    return { deployments: [], pagination: { next: 123 } };
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_PAGINATION_LOOP");
  assert.equal(calls, 2);

  let cursor = 1000;
  await assert.rejects(() => collectVercelDeploymentScope(async () => ({
    deployments: [],
    pagination: { next: cursor += 1 },
  }), selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_PAGINATION_INCOMPLETE");

  const fixture = provider(selectedRequest);
  await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
    const payload = await fixture.readApi(path);
    if (path.startsWith("/v6/deployments?")) {
      for (const deployment of payload.deployments) {
        if (deployment.uid === postFreezeId) deployment.meta.githubCommitRef = "unreviewed-branch";
      }
    }
    return payload;
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
});

test("post-capture additions are limited to the exact certified candidate SHA and target classes", async () => {
  const selectedRequest = request();
  const wrongSha = "8".repeat(40);
  const wrongShaFixture = provider(selectedRequest);
  await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
    const payload = await wrongShaFixture.readApi(path);
    if (path.startsWith("/v6/deployments?")) {
      for (const deployment of payload.deployments) {
        if (deployment.uid === postFreezeId) deployment.meta.githubCommitSha = wrongSha;
      }
    }
    return payload;
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");

  const mainAdditionFixture = provider(selectedRequest);
  await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
    const payload = await mainAdditionFixture.readApi(path);
    if (path.startsWith("/v6/deployments?")) {
      for (const deployment of payload.deployments) {
        if (deployment.uid === postFreezeId) {
          deployment.target = "production";
          deployment.meta.githubCommitRef = "main";
        }
      }
    }
    return payload;
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");

  const productionAdditionInRehearsal = provider(selectedRequest);
  await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
    const payload = await productionAdditionInRehearsal.readApi(path);
    if (path.startsWith("/v6/deployments?")) {
      for (const deployment of payload.deployments) {
        if (deployment.uid === postFreezeId) deployment.target = "production";
      }
    }
    return payload;
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
});

test("persistent signer is read/installed only through the fixed macOS Keychain item", async () => {
  const pair = keys();
  const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const readCalls = [];
  const loaded = await readKeychainAttestationPrivateKey({
    execFileImpl: async (...args) => {
      readCalls.push(args);
      return { stdout: privatePem };
    },
  });
  assert.equal(loaded, privatePem.trim());
  assert.deepEqual(readCalls[0][1], [
    "find-generic-password",
    "-a", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
    "-s", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
    "-w",
  ]);
  assert.ok(!JSON.stringify(readCalls).includes(privatePem));

  let installArgs;
  let stdinSecret;
  const installed = await installKeychainAttestationSigner({
    execFileImpl: async () => {
      const error = new Error("not found");
      error.code = 44;
      throw error;
    },
    spawnImpl: (binary, args) => {
      installArgs = { binary, args };
      const child = new EventEmitter();
      child.stdin = {
        end(value) {
          stdinSecret = value;
          queueMicrotask(() => child.emit("exit", 0));
        },
      };
      return child;
    },
  });
  assert.equal(installArgs.binary, "/usr/bin/security");
  assert.equal(installArgs.args.at(-1), "-w");
  assert.ok(!JSON.stringify(installArgs).includes("BEGIN PRIVATE KEY"));
  assert.match(stdinSecret, /BEGIN PRIVATE KEY/);
  assert.match(installed.publicKeyBase64, /^[A-Za-z0-9+/=]+$/);
  assert.match(installed.signerKeyFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(installed.recovered, false);

  let spawnCalled = false;
  const recovered = await installKeychainAttestationSigner({
    execFileImpl: async () => ({ stdout: privatePem }),
    spawnImpl: () => {
      spawnCalled = true;
      throw new Error("must not overwrite");
    },
  });
  assert.equal(spawnCalled, false);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.publicKeyBase64,
    pinnedEd25519PublicKeyBase64(pair.publicKey));
  assert.match(recovered.signerKeyFingerprint, /^[0-9a-f]{64}$/);
});
