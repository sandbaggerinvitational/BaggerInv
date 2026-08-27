import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signDetached,
} from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalAttestationJson,
  collectVercelAliasScope,
  collectVercelDeploymentScope,
  createVercelWafRuleInsertDispatchResult,
  createVercelWafProviderEvidence,
  createVercelProviderAttestation,
  normalizeVercelEnvironmentScope,
  normalizeVercelFirewallConfiguration,
  normalizeVercelWafProviderConfiguration,
  pinnedEd25519PublicKeyBase64,
  verifyVercelWafProviderEvidence,
  verifyVercelWafRuleInsertDispatchResult,
  verifyVercelProviderAttestation,
  VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV,
  VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
  VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
  VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
} from "../lib/vercel-provider-attestation.js";
import {
  productionLegacyDeploymentInventory,
} from
  "../lib/production-google-writer-fence-quiesce.js";
import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
  productionGoogleCredentialConfinementEvidence,
} from "../lib/production-google-credential-confinement.js";
import {
  productionWriterQuiesceRoutingRulePayload,
  verifiedProviderAttestationPayload,
} from
  "../lib/production-google-writer-fence-provider-claim.js";
import {
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
  buildProductionGoogleWriterCriticalWindowVercelRuleInsert,
  productionGoogleWriterCriticalWindowWafContract,
} from "../lib/production-google-writer-critical-window-waf.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from
  "../lib/google-service-account-credential-context.js";
import {
  createVercelCliReadApi,
  installKeychainAttestationSigner,
  readKeychainAttestationPrivateKey,
  runLocalVercelWafProviderAttester,
  runLocalVercelWafRuleInsertResultAttester,
  VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
  VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SECRET_PREFIX,
  VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
} from
  "../tools/step11-6-operator/vercel-provider-attester.mjs";

const teamId = "team_SandbaggerInvitational01";
const ruleId = "writer-quiesce-rule";
const runOwnedRuleNonce = "11111111-1111-4111-8111-111111111111";
const runOwnedRuleName = `writer-quiesce-${runOwnedRuleNonce}`;
const candidateId = "dpl_Step116AttestedCandidate01";
const candidateSha = "7".repeat(40);
const candidateAlias =
  "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app";
const candidateImmutable =
  "https://bagger-step116signed-sandbagger-invitational.vercel.app";
const runOwnedInsert = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
  candidateAliasOrigin: candidateAlias,
  candidateImmutableOrigin: candidateImmutable,
  runOwnedRuleName,
  runOwnedRuleNonce,
});
const capturedLater = "2026-08-27T02:00:00.000Z";
const now = Date.parse("2026-08-27T02:10:00.000Z");
const retainedAliasCensus = JSON.parse(readFileSync(new URL(
  "../docs/evidence/step11-6-production-active-alias-census-v1.json",
  import.meta.url,
), "utf8"));
const retainedCandidateAliasHostname =
  "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app";

function request({
  stage = "BEGIN",
  purpose = "REHEARSAL",
  target = "PREVIEW",
  requestId = "11111111-1111-4111-8111-111111111111",
  challengeId = "33333333-3333-4333-8333-333333333333",
  selectedCandidateId = candidateId,
  selectedCandidateSha = candidateSha,
  selectedCandidateAlias = candidateAlias,
  selectedCandidateImmutable = candidateImmutable,
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
    candidateDeploymentId: selectedCandidateId,
    candidateCommitSha: selectedCandidateSha,
    candidateDeploymentTarget: target,
    candidateAliasOrigin: selectedCandidateAlias,
    candidateImmutableOrigin: selectedCandidateImmutable,
    routingRuleId: ruleId,
    routingRuleConfigVersion: "17",
  };
}

function firewall({
  active = true,
  action = "deny",
  version = "17",
  selectedCandidateAlias = candidateAlias,
  selectedCandidateImmutable = candidateImmutable,
} = {}) {
  const criticalWindow = productionGoogleWriterCriticalWindowWafContract({
    candidateAliasOrigin: selectedCandidateAlias,
    candidateImmutableOrigin: selectedCandidateImmutable,
  });
  const candidateHosts = criticalWindow.candidateControlHosts.hostnames;
  const config = {
    version,
    id: `waf-config-${version}`,
    ownerId: teamId,
    firewallEnabled: true,
    ips: [],
    crs: {
      gen: { active: true, action: "log" },
      sqli: { active: true, action: "log" },
    },
    changes: [{ action: "active.read" }],
    projectKey: "bagger-inv-active",
    updatedAt: "2026-08-27T02:00:00.000Z",
    rules: [{
      id: ruleId,
      name: runOwnedRuleName,
      active,
      conditionGroup: [{
        conditions: [
          {
            type: "hostname",
            op: "neq",
            value: "baggerinv.com",
          },
          {
            type: "hostname",
            op: "inc",
            neg: true,
            value: [...candidateHosts],
          },
        ],
      }, {
        conditions: [
          {
            type: "hostname",
            op: "inc",
            value: [...candidateHosts],
          },
          {
            type: "path",
            op: "eq",
            neg: true,
            value: "/api/admin/step11-6-production-google-writer-fence",
          },
        ],
      }, {
        conditions: [
          {
            type: "hostname",
            op: "inc",
            value: [...candidateHosts],
          },
          {
            type: "method",
            op: "neq",
            value: "POST",
          },
        ],
      }, {
        conditions: [{
          type: "hostname",
          op: "eq",
          value: "baggerinv.com",
        }, {
          type: "method",
          op: "ninc",
          value: [...PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS],
        }],
      }, {
        conditions: [{
          type: "hostname",
          op: "eq",
          value: "baggerinv.com",
        }, {
          type: "path",
          op: "re",
          value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
        }],
      }],
      action: { mitigate: { action } },
    }],
  };
  return {
    active: config,
    draft: null,
    versions: [],
    activeVersion: {
      ...structuredClone(config),
      changes: [],
      projectKey: "bagger-inv-version-read",
      updatedAt: "2026-08-27T01:59:00.000Z",
    },
  };
}

function baselineFirewall({ version = "10" } = {}) {
  const config = {
    version,
    id: `waf-config-${version}`,
    ownerId: teamId,
    firewallEnabled: true,
    ips: [],
    crs: {
      gen: { active: true, action: "log" },
      sqli: { active: true, action: "log" },
    },
    changes: [{ action: "active.read" }],
    projectKey: "bagger-inv-active",
    updatedAt: "2026-08-27T02:00:00.000Z",
    rules: [],
  };
  return {
    active: config,
    draft: null,
    versions: [],
    activeVersion: {
      ...structuredClone(config),
      changes: [],
      projectKey: "bagger-inv-version-read",
      updatedAt: "2026-08-27T01:59:00.000Z",
    },
  };
}

function bindExactActiveVersion(payload) {
  payload.activeVersion = {
    ...structuredClone(payload.active),
    changes: [],
    projectKey: "bagger-inv-version-read",
    updatedAt: "2026-08-27T01:59:00.000Z",
  };
  return payload;
}

function wafEvidenceRequest({
  stage,
  evidenceRequestId,
  transitionRequestId,
  baselineEvidenceId = null,
  criticalEvidenceId = null,
  baselineSemanticFingerprint = null,
  criticalSemanticFingerprint = null,
  baselineConfigurationVersion = null,
  baselineSourceVersionReadFingerprint = null,
  providerAssignedRuleId =
    new Set(["CRITICAL_ACTIVE", "CRITICAL_REATTEST"]).has(stage) ? ruleId : null,
  transitionMode = "REHEARSAL",
  purpose = transitionMode === "REHEARSAL" ? "REHEARSAL" : "CUTOVER",
  expectedConfigurationVersion,
} = {}) {
  const generated = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
    runOwnedRuleName,
    runOwnedRuleNonce,
  });
  return {
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
    evidenceRequestId,
    wafEpochId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    transitionRequestId,
    stage,
    purpose,
    transitionMode,
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
    candidateDeploymentId: candidateId,
    candidateCommitSha: candidateSha,
    candidateDeploymentTarget: "PREVIEW",
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint: generated.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      generated.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId,
    baselineEvidenceId,
    criticalEvidenceId,
    baselineSemanticFingerprint,
    criticalSemanticFingerprint,
    baselineConfigurationVersion,
    baselineSourceVersionReadFingerprint,
    expectedConfigurationVersion,
  };
}

function rawDeployment(tuple) {
  const [uid, , providerSha, origin, target, branch, providerSource, status, createdAt] =
    tuple;
  return {
    uid,
    url: new URL(origin).hostname,
    target: target === "PREVIEW" ? null : "production",
    readyState: status === "BLOCKED" ? "CANCELED" : status,
    createdAt: Date.parse(createdAt),
    source: providerSource.toLowerCase(),
    meta: providerSha === null ? {} : {
      githubCommitSha: providerSha,
      ...(branch ? { githubCommitRef: branch } : {}),
    },
  };
}

function liveProviderTuples(selectedRequest, { candidateRetained = false } = {}) {
  const retained = productionLegacyDeploymentInventory().providerRecordTuples
    .map((tuple) => [...tuple]);
  if (candidateRetained) return retained;
  return [
    ...retained,
    [selectedRequest.candidateDeploymentId, selectedRequest.candidateCommitSha,
      selectedRequest.candidateCommitSha, selectedRequest.candidateImmutableOrigin,
      selectedRequest.candidateDeploymentTarget,
      "feature/mock-tournament-qa-integration", "GIT", "READY", capturedLater,
      "EXACT_PROVIDER"],
  ].sort((left, right) => {
    const a = `${left[0]}\n${left[3]}`;
    const b = `${right[0]}\n${right[3]}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function rawAliases(selectedRequest) {
  const candidateAliasHostname = new URL(selectedRequest.candidateAliasOrigin).hostname;
  const candidateImmutableHostname =
    new URL(selectedRequest.candidateImmutableOrigin).hostname;
  const records = retainedAliasCensus.records.map((record) => [...record]);
  const candidateIndex = records.findIndex((record) =>
    record[0] === retainedCandidateAliasHostname);
  assert.notEqual(candidateIndex, -1);
  records[candidateIndex] = [
    candidateAliasHostname,
    selectedRequest.candidateDeploymentId,
    candidateImmutableHostname,
    null,
    null,
  ];
  if (selectedRequest.purpose === "CUTOVER") {
    for (const hostname of ["baggerinv.com", "bagger-inv.vercel.app"]) {
      const index = records.findIndex((record) => record[0] === hostname);
      assert.notEqual(index, -1);
      records[index] = [
        hostname,
        selectedRequest.candidateDeploymentId,
        candidateImmutableHostname,
        null,
        null,
      ];
    }
    const wwwIndex = records.findIndex((record) =>
      record[0] === "www.baggerinv.com");
    assert.notEqual(wwwIndex, -1);
    records[wwwIndex] = [
      "www.baggerinv.com",
      selectedRequest.candidateDeploymentId,
      candidateImmutableHostname,
      "baggerinv.com",
      308,
    ];
  }
  return records.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)
    .map(([alias, deploymentId, deploymentOrigin, redirect, redirectStatusCode]) => ({
      alias,
      deploymentId,
      deployment: { id: deploymentId, url: deploymentOrigin },
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      redirect,
      redirectStatusCode,
      deletedAt: null,
    }));
}

function provider(selectedRequest, options = {}) {
  const tuples = liveProviderTuples(selectedRequest, options);
  const deployments = tuples.map(rawDeployment);
  const aliases = rawAliases(selectedRequest);
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
  const certifiedEnvironmentReview = productionGoogleCredentialConfinementEvidence()
    .providerEnvironmentResourceReview;
  const reviewedEnvironmentRecords = certifiedEnvironmentReview.records.map((record) => ({
    id: record[0],
    key: record[1],
    type: record[2],
    target: record[3],
    ...(record[4] === null ? {} : { gitBranch: record[4] }),
    createdAt: record[5],
    updatedAt: record[6],
    configurationId: record[7],
    ...(record[8] === null ? {} : { visibility: record[8] }),
    value: record[2] === "sensitive" ? "" : `fixture-opaque-ciphertext-${record[0]}`,
    decrypted: false,
  }));
  let environmentIdentity = 0;
  const runtimeEnvironmentRecords = requiredEnvironmentNames.flatMap((key, index) => {
    const broadLegacy = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]
      .includes(key);
    const targets = broadLegacy ? ["production", "preview"] : [candidateTarget];
    const gitBranch = broadLegacy ? null : candidateBranch;
    const alreadyPresent = reviewedEnvironmentRecords.some((record) =>
      record.key === key && JSON.stringify(record.target) === JSON.stringify(targets) &&
      (record.gitBranch ?? null) === gitBranch);
    if (alreadyPresent) return [];
    environmentIdentity += 1;
    return [{
      id: `env_fixture_runtime_${environmentIdentity}`,
      key,
      type: "sensitive",
      target: targets,
      ...(gitBranch === null ? {} : { gitBranch }),
      createdAt: 1_725_100_000_000 + index,
      updatedAt: 1_725_200_000_000 + index,
      configurationId: null,
      value: "",
      decrypted: false,
    }];
  });
  const unrelatedCount = 121 - reviewedEnvironmentRecords.length -
    runtimeEnvironmentRecords.length;
  const environmentPayload = {
    hiddenProductionEnvCount: 0,
    envs: [
      ...reviewedEnvironmentRecords,
      ...runtimeEnvironmentRecords,
      ...Array.from({ length: unrelatedCount }, (_, index) => ({
        id: `env_fixture_unrelated_${index}`,
        key: `UNRELATED_PUBLIC_SETTING_${index}`,
        target: ["production"],
        value: "ignored",
      })),
    ],
  };
  const readApi = async (path) => {
    paths.push(path);
    if (path.startsWith("/v1/security/firewall/config?")) return firewall({
      ...options.firewall,
      selectedCandidateAlias: selectedRequest.candidateAliasOrigin,
      selectedCandidateImmutable: selectedRequest.candidateImmutableOrigin,
    });
    if (path.startsWith("/v9/projects/")) return structuredClone(environmentPayload);
    if (path.startsWith("/v6/deployments?")) {
      const cursor = Number(new URL(`https://local${path}`).searchParams.get("until") || 0);
      const page = deployments.slice(cursor, cursor + 100);
      const next = cursor + page.length < deployments.length ? cursor + page.length : null;
      return { deployments: page, pagination: { next } };
    }
    if (path.startsWith("/v4/aliases?")) {
      const cursor = Number(new URL(`https://local${path}`).searchParams.get("until") || 0);
      const page = aliases.slice(cursor, cursor + 100);
      const next = cursor + page.length < aliases.length ? cursor + page.length : null;
      return { aliases: page, pagination: { count: page.length, next } };
    }
    throw new Error(`Unexpected path: ${path}`);
  };
  return {
    readApi,
    paths,
    secretValues,
    tuples,
    certifiedEnvironmentReview,
  };
}

let environmentMutationIdentity = 0;
function fixtureEnvironmentRecord({ key, target = ["preview"], gitBranch = null }) {
  environmentMutationIdentity += 1;
  return {
    id: `env_fixture_mutation_${environmentMutationIdentity}`,
    key,
    type: "sensitive",
    target,
    ...(gitBranch === null ? {} : { gitBranch }),
    createdAt: 1_725_300_000_000 + environmentMutationIdentity,
    updatedAt: 1_725_400_000_000 + environmentMutationIdentity,
    configurationId: null,
    value: "",
    decrypted: false,
  };
}

function replaceUnrelatedEnvironmentRecords(payload, additions) {
  const envs = structuredClone(payload.envs);
  for (let index = 0; index < additions.length; index += 1) {
    const unrelated = envs.findIndex((record) =>
      String(record.key || "").startsWith("UNRELATED_PUBLIC_SETTING_"));
    assert.notEqual(unrelated, -1);
    envs.splice(unrelated, 1);
  }
  return { ...payload, envs: [...envs, ...additions] };
}

function normalizeFixtureEnvironment(payload, selectedRequest) {
  const review = productionGoogleCredentialConfinementEvidence()
    .providerEnvironmentResourceReview;
  return normalizeVercelEnvironmentScope(payload, {
    request: selectedRequest,
    reviewedResourceReview: review,
    providerEnvironmentRecordCount: review.providerEnvironmentRecordCount,
  });
}

function keys() {
  return generateKeyPairSync("ed25519");
}

function resignEnvelope(envelope, privateKey) {
  const document = {
    schemaVersion: envelope.schemaVersion,
    algorithm: envelope.algorithm,
    signerKeyVersion: envelope.signerKeyVersion,
    signerKeyFingerprint: envelope.signerKeyFingerprint,
    attestation: envelope.attestation,
  };
  const serialized = canonicalAttestationJson(document);
  return {
    ...document,
    attestationFingerprint:
      createHash("sha256").update(serialized).digest("hex"),
    signature: signDetached(
      null,
      Buffer.from(serialized),
      privateKey,
    ).toString("base64url"),
  };
}

test("local attester exhausts deployment pagination, accepts additive scope, and redacts values", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const scope = await collectVercelDeploymentScope(fixture.readApi, selectedRequest);
  assert.equal(scope.retainedRecordCount, 1292);
  assert.equal(scope.retainedProviderRecordCount, 1292);
  assert.equal(scope.liveRecordCount, 1293);
  assert.equal(scope.liveRecords.length, 1293);
  assert.equal(scope.liveProviderRecords.length, 1293);
  assert.equal(scope.paginationComplete, true);
  assert.equal(scope.pageCount, 13);
  assert.equal(scope.liveRecords.filter((tuple) => tuple[1] === null).length, 8);
  assert.ok(fixture.paths.filter((path) => path.startsWith("/v6/deployments?")).length === 13);
  assert.ok(fixture.paths.some((path) => path.includes("until=1200")));

  const environment = normalizeVercelEnvironmentScope(await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  ));
  assert.equal(environment.records.length, 19);
  assert.equal(environment.records.filter((record) =>
    ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].includes(record[1]) &&
    record[3].join(",") === "preview,production" && record[4] === null).length, 2);
  assert.ok(environment.records.filter((record) =>
    !["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].includes(record[1]) &&
      record[4] !== null)
    .every((record) => record[3][0] === "preview" &&
      record[4] === "feature/mock-tournament-qa-integration"));
  assert.ok(fixture.secretValues.every((secret) =>
    !JSON.stringify(environment).includes(secret)));
});

test("exact retained CLI deployments with unavailable SHA remain accepted but cannot drift", async () => {
  const selectedRequest = request();
  const retainedCli = productionLegacyDeploymentInventory().providerRecordTuples.find(
    (tuple) => tuple[9] === "UNAVAILABLE",
  );
  assert.equal(retainedCli[1], null);
  assert.equal(retainedCli[2], null);
  assert.equal(retainedCli[5], null);
  assert.equal(retainedCli[6], "CLI");

  const exactFixture = provider(selectedRequest);
  const exactScope = await collectVercelDeploymentScope(
    exactFixture.readApi,
    selectedRequest,
  );
  assert.equal(exactScope.liveRecords.filter((tuple) =>
    tuple[0] === retainedCli[0] && tuple[2] === retainedCli[3]).length, 1);

  for (const mutate of [
    (record) => { record.meta.githubCommitSha = "a".repeat(40); },
    (record) => { record.meta.githubCommitRef =
      "feature/mock-tournament-qa-integration"; },
    (record) => { record.source = "git"; },
    (record) => { record.target = "production"; },
    (record) => { record.readyState = retainedCli[7] === "READY" ? "ERROR" : "READY"; },
  ]) {
    const driftFixture = provider(selectedRequest);
    const originalReader = driftFixture.readApi;
    await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
      const payload = await originalReader(path);
      if (path.startsWith("/v6/deployments?")) {
        const record = payload.deployments.find((item) => item.uid === retainedCli[0]);
        if (record) mutate(record);
      }
      return payload;
    }, selectedRequest), (error) =>
      error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
  }
});

test("exact complete retained census plus one dynamic candidate is accepted", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const scope = await collectVercelDeploymentScope(fixture.readApi, selectedRequest);
  assert.equal(scope.retainedRecordCount, 1292);
  assert.equal(scope.liveRecordCount, 1293);
  assert.equal(scope.liveRecords.length, 1293);
  assert.equal(scope.liveRecords.filter((tuple) =>
    tuple[0] === candidateId && tuple[2] === candidateImmutable).length, 1);
});

test("an exact candidate already present in the retained census needs no additive tuple", async () => {
  const retainedCandidate = productionLegacyDeploymentInventory().providerRecordTuples.find(
    (tuple) => tuple[0] === "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
  );
  const selectedRequest = request({
    selectedCandidateId: retainedCandidate[0],
    selectedCandidateSha: retainedCandidate[1],
    selectedCandidateImmutable: retainedCandidate[3],
    selectedCandidateAlias:
      "https://bagger-retained-candidate-alias-sandbagger-invitational.vercel.app",
  });
  const fixture = provider(selectedRequest, { candidateRetained: true });
  const scope = await collectVercelDeploymentScope(fixture.readApi, selectedRequest);
  assert.equal(scope.liveRecordCount, 1292);
  assert.equal(scope.liveProviderRecordCount, 1292);
  assert.equal(scope.liveRecords.filter((tuple) =>
    tuple[0] === retainedCandidate[0] && tuple[2] === retainedCandidate[3]).length, 1);
});

test("signed BEGIN and independently signed FINALIZE attestations bind Preview scope", async () => {
  const keyPair = keys();
  const beginRequest = request();
  const beginFixture = provider(beginRequest);
  const begin = await createVercelProviderAttestation({
    request: beginRequest,
    privateKey: keyPair.privateKey,
    readApi: beginFixture.readApi,
    _testOnlyEnvironmentResourceReview: beginFixture.certifiedEnvironmentReview,
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
  assert.equal(verifiedBegin.purpose, "REHEARSAL");
  assert.equal(verifiedBegin.candidateDeploymentTarget, "PREVIEW");
  assert.equal(verifiedBegin.liveOriginInventoryCount, 1293);
  assert.equal(verifiedBegin.aliasInventoryCount, 56);
  assert.equal(verifiedBegin.aliasInventoryRecords.length, 56);
  assert.equal(createHash("sha256").update(
    JSON.stringify(verifiedBegin.aliasInventoryRecords)).digest("hex"),
  verifiedBegin.aliasInventoryFingerprint);
  assert.equal(verifiedBegin.aliasPaginationPageCount, 1);
  assert.equal(verifiedBegin.routingRulePendingDraftChangeCount, 0);
  assert.equal(verifiedBegin.routingRuleHostnameOperator, "DOES_NOT_EQUAL");
  assert.equal(verifiedBegin.routingRuleCanonicalHostname, "baggerinv.com");
  assert.equal(verifiedBegin.routingRuleEarlierActiveBypassRuleCount, 0);
  assert.equal(verifiedBegin.routingRuleCandidateControlHostCount, 2);
  assert.equal(verifiedBegin.routingRuleCandidateControlHostsFingerprint,
    productionGoogleWriterCriticalWindowWafContract(beginRequest)
      .candidateControlHosts.hostsFingerprint);
  assert.equal(verifiedBegin.credentialConfinementEvidenceSchema,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA);
  assert.equal(verifiedBegin.credentialConfinementRecordCount,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT);
  assert.equal(verifiedBegin.credentialConfinementRecordsFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT);
  assert.equal(verifiedBegin.credentialConfinementEvidenceFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT);
  const receiptClaim = verifiedProviderAttestationPayload(verifiedBegin, "BEGIN");
  assert.equal(receiptClaim.purpose, "REHEARSAL");
  assert.equal(receiptClaim.candidate_alias_origin, candidateAlias);
  assert.equal(receiptClaim.candidate_immutable_origin, candidateImmutable);
  assert.equal(receiptClaim.alias_inventory_count, 56);
  assert.equal(receiptClaim.alias_inventory_fingerprint,
    verifiedBegin.aliasInventoryFingerprint);
  assert.deepEqual(receiptClaim.alias_inventory_records,
    verifiedBegin.aliasInventoryRecords);
  assert.equal(receiptClaim.routing_rule_all_method_fence_required_path_count, 1);
  assert.equal(receiptClaim.routing_rule_all_method_fence_required_paths_fingerprint,
    "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa");
  const topLevelRule = productionWriterQuiesceRoutingRulePayload({
    ruleId,
    revision: "17",
    scope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
    hostnameOperator: verifiedBegin.routingRuleHostnameOperator,
    canonicalHostname: verifiedBegin.routingRuleCanonicalHostname,
    allMethodFenceRequiredHostCount:
      verifiedBegin.routingRuleAllMethodFenceRequiredHostCount,
    allMethodFenceRequiredHostsFingerprint:
      verifiedBegin.routingRuleAllMethodFenceRequiredHostsFingerprint,
    allMethodFenceRequiredPathCount:
      verifiedBegin.routingRuleAllMethodFenceRequiredPathCount,
    allMethodFenceRequiredPathsFingerprint:
      verifiedBegin.routingRuleAllMethodFenceRequiredPathsFingerprint,
    canonicalApexSafeMethodCount:
      verifiedBegin.routingRuleCanonicalApexSafeMethodCount,
    canonicalApexSafeMethodsFingerprint:
      verifiedBegin.routingRuleCanonicalApexSafeMethodsFingerprint,
    canonicalApexSafeMethodWriterRouteCount:
      verifiedBegin.routingRuleCanonicalApexSafeMethodWriterRouteCount,
    canonicalApexSafeMethodWriterRoutesFingerprint:
      verifiedBegin.routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint,
    globalInvocationQuiescenceProved:
      verifiedBegin.routingRuleGlobalInvocationQuiescenceProved,
  });
  assert.deepEqual(Object.keys(topLevelRule).sort(), [
    "routing_rule_all_method_fence_required_host_count",
    "routing_rule_all_method_fence_required_hosts_fingerprint",
    "routing_rule_all_method_fence_required_path_count",
    "routing_rule_all_method_fence_required_paths_fingerprint",
    "routing_rule_canonical_apex_safe_method_count",
    "routing_rule_canonical_apex_safe_method_writer_route_count",
    "routing_rule_canonical_apex_safe_method_writer_routes_fingerprint",
    "routing_rule_canonical_apex_safe_methods_fingerprint",
    "routing_rule_canonical_hostname", "routing_rule_hostname_operator",
    "routing_rule_global_invocation_quiescence_proved",
    "routing_rule_id", "routing_rule_revision", "routing_rule_scope",
  ].sort());

  const finalizeRequest = request({
    stage: "FINALIZE",
    requestId: "44444444-4444-4444-8444-444444444444",
    challengeId: "66666666-6666-4666-8666-666666666666",
  });
  const finalizeFixture = provider(finalizeRequest);
  const finalize = await createVercelProviderAttestation({
    request: finalizeRequest,
    privateKey: keyPair.privateKey,
    readApi: finalizeFixture.readApi,
    _testOnlyEnvironmentResourceReview: finalizeFixture.certifiedEnvironmentReview,
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
    _testOnlyEnvironmentResourceReview: beginFixture.certifiedEnvironmentReview,
    now,
    attestationId: beginRequest.challengeId,
  }), (error) => error.code === "STEP11_6_VERCEL_ATTESTATION_ID_INVALID");
});

test("signed provider evidence requires two identical exhaustive deployment passes", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  let pass = 0;
  await assert.rejects(() => createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keys().privateKey,
    readApi: async (path) => {
      const isDeploymentPage = path.startsWith("/v6/deployments?");
      if (isDeploymentPage && !new URL(`https://local${path}`).searchParams.has("until")) {
        pass += 1;
      }
      const payload = await fixture.readApi(path);
      if (isDeploymentPage && pass === 2) {
        const candidate = payload.deployments.find((item) => item.uid === candidateId);
        if (candidate) candidate.createdAt += 1;
      }
      return payload;
    },
    _testOnlyEnvironmentResourceReview: fixture.certifiedEnvironmentReview,
    now,
  }), (error) => error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
  assert.equal(pass, 2);
});

test("signed provider evidence requires two identical exhaustive alias passes", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  let pass = 0;
  await assert.rejects(() => createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keys().privateKey,
    readApi: async (path) => {
      const isAliasPage = path.startsWith("/v4/aliases?");
      if (isAliasPage && !new URL(`https://local${path}`).searchParams.has("until")) {
        pass += 1;
      }
      const payload = await fixture.readApi(path);
      if (isAliasPage && pass === 2) {
        const changed = payload.aliases.find((item) =>
          item.alias !== new URL(candidateAlias).hostname &&
          !item.alias.includes("course-hole"));
        changed.deploymentId = "dpl_AliasDrift12345";
        changed.deployment.id = "dpl_AliasDrift12345";
        changed.deployment.url =
          "bagger-aliasdrift-sandbagger-invitational.vercel.app";
      }
      return payload;
    },
    _testOnlyEnvironmentResourceReview: fixture.certifiedEnvironmentReview,
    now,
  }), (error) => error.code === "STEP11_6_VERCEL_ALIAS_SCOPE_DRIFT");
  assert.equal(pass, 2);
});

test("a freshly re-signed but reordered live inventory is rejected by scope normalization", async () => {
  const selectedRequest = request();
  const keyPair = keys();
  const fixture = provider(selectedRequest);
  const envelope = structuredClone(await createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keyPair.privateKey,
    readApi: fixture.readApi,
    _testOnlyEnvironmentResourceReview: fixture.certifiedEnvironmentReview,
    now,
  }));
  const records = envelope.attestation.liveProviderInventoryRecords;
  [records[0], records[1]] = [records[1], records[0]];
  envelope.attestation.liveProviderInventoryFingerprint =
    createHash("sha256").update(JSON.stringify(records)).digest("hex");
  const resigned = resignEnvelope(envelope, keyPair.privateKey);
  assert.throws(() => verifyVercelProviderAttestation(resigned, {
    env: {
      [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
        pinnedEd25519PublicKeyBase64(keyPair.publicKey),
      [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
    },
    request: selectedRequest,
    expectedRoutingRuleRevision: "17",
    now: now + 10_000,
  }), (error) => error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
});

test("CUTOVER attestation binds the exact Preview control candidate without relabeling main", async () => {
  const selectedRequest = request({ purpose: "CUTOVER", target: "PREVIEW" });
  const fixture = provider(selectedRequest);
  const keyPair = keys();
  const envelope = await createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keyPair.privateKey,
    readApi: fixture.readApi,
    _testOnlyEnvironmentResourceReview: fixture.certifiedEnvironmentReview,
    now,
  });
  assert.equal(envelope.attestation.candidateDeploymentTarget, "PREVIEW");
  assert.ok(envelope.attestation.liveOriginInventoryRecords.some((tuple) =>
    tuple[0] === candidateId && tuple[3] === "PROJECT_PREVIEW"));
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
  assert.equal(verified.candidateDeploymentTarget, "PREVIEW");
});

test("tamper, stale proof, wrong purpose/target, firewall drift, and deployment drift fail closed", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const keyPair = keys();
  const envelope = await createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keyPair.privateKey,
    readApi: fixture.readApi,
    _testOnlyEnvironmentResourceReview: fixture.certifiedEnvironmentReview,
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
    request({ purpose: "CUTOVER", target: "PRODUCTION" }),
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
  assert.throws(() => normalizeVercelFirewallConfiguration(
    emptyDraft, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_DRAFT_PENDING");

  const normalizedFirewall = normalizeVercelFirewallConfiguration(
    firewall(), selectedRequest,
  );
  assert.equal(normalizedFirewall.pendingDraftChangeCount, 0);
  assert.equal(normalizedFirewall.hostnameOperator, "DOES_NOT_EQUAL");
  assert.equal(normalizedFirewall.canonicalHostname, "baggerinv.com");
  assert.equal(normalizedFirewall.earlierActiveBypassRuleCount, 0);
  assert.equal(normalizedFirewall.criticalWindowComplementConditionGroupCount, 5);
  assert.equal(normalizedFirewall.candidateControlHostCount, 2);
  assert.equal(normalizedFirewall.candidateControlHostsFingerprint,
    productionGoogleWriterCriticalWindowWafContract(selectedRequest)
      .candidateControlHosts.hostsFingerprint);
  assert.equal(normalizedFirewall.canonicalApexSafeMethodCount, 3);
  assert.equal(normalizedFirewall.canonicalApexSafeMethodWriterRouteCount, 10);
  assert.equal(normalizedFirewall.globalInvocationQuiescenceProved, true);
  assert.equal(normalizedFirewall.allMethodFenceRequiredHostCount, 9);
  assert.equal(normalizedFirewall.allMethodFenceRequiredHostsFingerprint,
    "0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c");
  assert.equal(normalizedFirewall.allMethodFenceRequiredPathCount, 1);
  assert.equal(normalizedFirewall.allMethodFenceRequiredPathsFingerprint,
    "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa");

  const staleSevenGroup = firewall();
  staleSevenGroup.active.rules[0].conditionGroup.splice(3, 0, {
    conditions: [{ type: "hostname", op: "inc", value: ["legacy.vercel.app"] }],
  }, {
    conditions: [{ type: "path", op: "inc", value: ["/api/legacy"] }],
  });
  bindExactActiveVersion(staleSevenGroup);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    staleSevenGroup, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const wrongCanonicalHost = firewall();
  wrongCanonicalHost.active.rules[0].conditionGroup[0].conditions[0].value =
    "www.baggerinv.com";
  bindExactActiveVersion(wrongCanonicalHost);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    wrongCanonicalHost, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const noApexNonSafeMethodGroup = firewall();
  noApexNonSafeMethodGroup.active.rules[0].conditionGroup.splice(3, 1);
  bindExactActiveVersion(noApexNonSafeMethodGroup);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    noApexNonSafeMethodGroup, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const wrongApexWriterPathRegex = firewall();
  wrongApexWriterPathRegex.active.rules[0].conditionGroup[4]
    .conditions[1].value = "^/api/health$";
  bindExactActiveVersion(wrongApexWriterPathRegex);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    wrongApexWriterPathRegex, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const wrongCandidateHostException = firewall();
  wrongCandidateHostException.active.rules[0].conditionGroup[0]
    .conditions[1].value[0] = "unattested-preview.vercel.app";
  bindExactActiveVersion(wrongCandidateHostException);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    wrongCandidateHostException, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const wrongControlPathException = firewall();
  wrongControlPathException.active.rules[0].conditionGroup[1]
    .conditions[1].value = "/api/admin/unscoped-control";
  bindExactActiveVersion(wrongControlPathException);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    wrongControlPathException, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const safeMethodException = firewall();
  safeMethodException.active.rules[0].conditionGroup[2]
    .conditions[1].value = "GET";
  bindExactActiveVersion(safeMethodException);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    safeMethodException, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const earlierBypass = firewall();
  earlierBypass.active.rules.unshift({
    id: "earlier-bypass-rule",
    active: true,
    conditionGroup: [{ conditions: [] }],
    action: { mitigate: { action: "bypass" } },
  });
  bindExactActiveVersion(earlierBypass);
  assert.throws(() => normalizeVercelFirewallConfiguration(
    earlierBypass, selectedRequest,
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

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

test("WAF semantic normalization separates the zero-rule baseline from provider version identity", () => {
  const baseline10 = normalizeVercelWafProviderConfiguration(
    baselineFirewall({ version: "10" }),
    {
      stage: "BASELINE_CAPTURE",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "10",
      runOwnedRuleName,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
    },
  );
  const baseline11 = normalizeVercelWafProviderConfiguration(
    baselineFirewall({ version: "11" }),
    {
      stage: "BASELINE_RESTORED",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "11",
      runOwnedRuleName,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
      baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
      criticalSemanticFingerprint: "c".repeat(64),
    },
  );
  assert.equal(baseline10.mode, "BASELINE");
  assert.equal(baseline10.customRuleCount, 0);
  assert.deepEqual(baseline10.semanticConfiguration.orderedCustomRules, []);
  assert.equal(
    baseline11.semanticConfigurationFingerprint,
    baseline10.semanticConfigurationFingerprint,
  );
  assert.notEqual(
    baseline11.configurationIdentityFingerprint,
    baseline10.configurationIdentityFingerprint,
  );

  const critical17 = normalizeVercelWafProviderConfiguration(firewall(), {
    stage: "CRITICAL_ACTIVE",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    configurationVersion: "17",
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      runOwnedInsert.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId: ruleId,
    baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
  });
  const critical18 = normalizeVercelWafProviderConfiguration(
    firewall({ version: "18" }),
    {
      stage: "CRITICAL_REATTEST",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "18",
      runOwnedRuleName,
      runOwnedRuleNonce,
      runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
      runOwnedInsertDocumentFingerprint:
        runOwnedInsert.runOwnedInsertDocumentFingerprint,
      providerAssignedRuleId: ruleId,
      baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
      criticalSemanticFingerprint: critical17.semanticConfigurationFingerprint,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
    },
  );
  assert.equal(critical17.mode, "CRITICAL_WINDOW");
  assert.equal(critical17.customRuleCount, 1);
  assert.equal(critical17.runOwnedRulePrecedence, 0);
  assert.equal(
    critical18.semanticConfigurationFingerprint,
    critical17.semanticConfigurationFingerprint,
  );
  assert.notEqual(
    critical18.configurationIdentityFingerprint,
    critical17.configurationIdentityFingerprint,
  );

  const staleSevenGroup = firewall();
  staleSevenGroup.active.rules[0].conditionGroup.push(
    { conditions: [{ type: "hostname", op: "inc", value: ["old.vercel.app"] }] },
    { conditions: [{ type: "path", op: "inc", value: ["/api/old"] }] },
  );
  bindExactActiveVersion(staleSevenGroup);
  assert.throws(() => normalizeVercelWafProviderConfiguration(
    staleSevenGroup,
    {
      stage: "CRITICAL_ACTIVE",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "17",
      runOwnedRuleName,
      runOwnedRuleNonce,
      runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
      runOwnedInsertDocumentFingerprint:
        runOwnedInsert.runOwnedInsertDocumentFingerprint,
      providerAssignedRuleId: ruleId,
      baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
    },
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  const extraRule = firewall();
  extraRule.active.rules.push({
    id: "unrelated-rule",
    active: true,
    conditionGroup: [{ conditions: [] }],
    action: { mitigate: { action: "deny" } },
  });
  bindExactActiveVersion(extraRule);
  assert.throws(() => normalizeVercelWafProviderConfiguration(
    extraRule,
    {
      stage: "CRITICAL_ACTIVE",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "17",
      runOwnedRuleName,
      runOwnedRuleNonce,
      runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
      runOwnedInsertDocumentFingerprint:
        runOwnedInsert.runOwnedInsertDocumentFingerprint,
      providerAssignedRuleId: ruleId,
      baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
    },
  ), (error) => error.code === "STEP11_6_VERCEL_FIREWALL_RULE_INVALID");

  for (const [field, value] of [
    ["ips", [{ hostname: "unreviewed.example", action: "deny" }]],
    ["crs", [{ id: "unreviewed-managed-rule", active: true }]],
  ]) {
    const drift = firewall();
    drift.active[field] = value;
    bindExactActiveVersion(drift);
    assert.throws(() => normalizeVercelWafProviderConfiguration(drift, {
      stage: "CRITICAL_ACTIVE",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "17",
      runOwnedRuleName,
      providerAssignedRuleId: ruleId,
      baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
    }), (error) =>
      error.code === "STEP11_6_VERCEL_WAF_BASELINE_BINDING_INVALID");
  }

  const unknownSecurityField = firewall();
  unknownSecurityField.active.botManagement = { enabled: false };
  unknownSecurityField.activeVersion.botManagement = { enabled: false };
  assert.throws(() => normalizeVercelWafProviderConfiguration(
    unknownSecurityField,
    {
      stage: "CRITICAL_ACTIVE",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      configurationVersion: "17",
      runOwnedRuleName,
      providerAssignedRuleId: ruleId,
      baselineSemanticFingerprint: baseline10.semanticConfigurationFingerprint,
      candidateAliasOrigin: candidateAlias,
      candidateImmutableOrigin: candidateImmutable,
    },
  ), (error) =>
    error.code === "STEP11_6_VERCEL_WAF_CONFIGURATION_SCHEMA_INVALID");
});

test("signed WAF evidence chains baseline, critical activation/reattest, and exact restoration", () => {
  const keyPair = keys();
  const env = {
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      pinnedEd25519PublicKeyBase64(keyPair.publicKey),
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
  };
  const baselineRequest = wafEvidenceRequest({
    stage: "BASELINE_CAPTURE",
    evidenceRequestId: "10000000-0000-4000-8000-000000000001",
    transitionRequestId: "10000000-0000-4000-8000-000000000002",
    expectedConfigurationVersion: "10",
  });
  const baselineEnvelope = createVercelWafProviderEvidence({
    request: baselineRequest,
    firewallPayload: baselineFirewall(),
    privateKey: keyPair.privateKey,
    now,
    evidenceId: "10000000-0000-4000-8000-000000000003",
  });
  const baseline = verifyVercelWafProviderEvidence(baselineEnvelope, {
    request: baselineRequest,
    env,
    now: now + 1_000,
  });
  assert.equal(baseline.stage, "BASELINE_CAPTURE");
  assert.equal(baseline.configurationMode, "BASELINE");
  assert.equal(baseline.customRuleCount, 0);

  const criticalRequest = wafEvidenceRequest({
    stage: "CRITICAL_ACTIVE",
    evidenceRequestId: "20000000-0000-4000-8000-000000000001",
    transitionRequestId: "20000000-0000-4000-8000-000000000002",
    baselineEvidenceId: baseline.evidenceId,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    expectedConfigurationVersion: "17",
  });
  const criticalEnvelope = createVercelWafProviderEvidence({
    request: criticalRequest,
    firewallPayload: firewall(),
    privateKey: keyPair.privateKey,
    now: now + 2_000,
    evidenceId: "20000000-0000-4000-8000-000000000003",
  });
  const critical = verifyVercelWafProviderEvidence(criticalEnvelope, {
    request: criticalRequest,
    env,
    now: now + 3_000,
  });
  assert.equal(critical.stage, "CRITICAL_ACTIVE");
  assert.equal(critical.configurationMode, "CRITICAL_WINDOW");
  assert.equal(critical.customRuleCount, 1);
  assert.equal(critical.runOwnedRulePrecedence, 0);

  const reattestRequest = wafEvidenceRequest({
    stage: "CRITICAL_REATTEST",
    evidenceRequestId: "30000000-0000-4000-8000-000000000001",
    transitionRequestId: "30000000-0000-4000-8000-000000000002",
    baselineEvidenceId: baseline.evidenceId,
    criticalEvidenceId: critical.evidenceId,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    criticalSemanticFingerprint: critical.semanticConfigurationFingerprint,
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    expectedConfigurationVersion: "17",
  });
  const reattestEnvelope = createVercelWafProviderEvidence({
    request: reattestRequest,
    firewallPayload: firewall(),
    privateKey: keyPair.privateKey,
    now: now + 4_000,
    evidenceId: "30000000-0000-4000-8000-000000000003",
  });
  const reattest = verifyVercelWafProviderEvidence(reattestEnvelope, {
    request: reattestRequest,
    env,
    now: now + 5_000,
  });
  assert.equal(
    reattest.semanticConfigurationFingerprint,
    critical.semanticConfigurationFingerprint,
  );

  const restoreRequest = wafEvidenceRequest({
    stage: "BASELINE_RESTORED",
    evidenceRequestId: "40000000-0000-4000-8000-000000000001",
    transitionRequestId: "40000000-0000-4000-8000-000000000002",
    baselineEvidenceId: baseline.evidenceId,
    criticalEvidenceId: critical.evidenceId,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    criticalSemanticFingerprint: critical.semanticConfigurationFingerprint,
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    expectedConfigurationVersion: "10",
  });
  const restoreEnvelope = createVercelWafProviderEvidence({
    request: restoreRequest,
    firewallPayload: baselineFirewall({ version: "10" }),
    privateKey: keyPair.privateKey,
    now: now + 6_000,
    evidenceId: "40000000-0000-4000-8000-000000000003",
  });
  const restored = verifyVercelWafProviderEvidence(restoreEnvelope, {
    request: restoreRequest,
    env,
    now: now + 7_000,
  });
  assert.equal(restored.stage, "BASELINE_RESTORED");
  assert.equal(restored.configurationMode, "BASELINE");
  assert.equal(
    restored.semanticConfigurationFingerprint,
    baseline.semanticConfigurationFingerprint,
  );
  assert.equal(
    restored.configurationIdentityFingerprint,
    baseline.configurationIdentityFingerprint,
  );
  assert.equal(
    restored.sourceVersionReadFingerprint,
    baseline.sourceVersionReadFingerprint,
  );

  const tampered = structuredClone(restoreEnvelope);
  tampered.evidence.configurationVersion = "19";
  assert.throws(() => verifyVercelWafProviderEvidence(tampered, {
    request: restoreRequest,
    env,
    now: now + 7_000,
  }), (error) => error.code === "STEP11_6_VERCEL_WAF_EVIDENCE_SIGNATURE_INVALID");

  assert.throws(() => createVercelWafProviderEvidence({
    request: { ...restoreRequest, baselineWafRestored: true },
    firewallPayload: baselineFirewall({ version: "18" }),
    privateKey: keyPair.privateKey,
    now,
  }), (error) => error.code === "STEP11_6_VERCEL_WAF_EVIDENCE_REQUEST_INVALID");

  const rollbackRequest = wafEvidenceRequest({
    stage: "BASELINE_CAPTURE",
    transitionMode: "ROLLBACK",
    evidenceRequestId: "45000000-0000-4000-8000-000000000001",
    transitionRequestId: "45000000-0000-4000-8000-000000000002",
    expectedConfigurationVersion: "10",
  });
  const rollbackEnvelope = createVercelWafProviderEvidence({
    request: rollbackRequest,
    firewallPayload: baselineFirewall(),
    privateKey: keyPair.privateKey,
    now,
    evidenceId: "45000000-0000-4000-8000-000000000003",
  });
  assert.equal(verifyVercelWafProviderEvidence(rollbackEnvelope, {
    request: rollbackRequest, env, now: now + 1_000,
  }).transitionMode, "ROLLBACK");
  assert.throws(() => createVercelWafProviderEvidence({
    request: { ...rollbackRequest, purpose: "REHEARSAL" },
    firewallPayload: baselineFirewall(),
    privateKey: keyPair.privateKey,
    now,
  }), (error) => error.code === "STEP11_6_VERCEL_WAF_EVIDENCE_REQUEST_INVALID");
});

test("signed RULE_INSERT result binds provider-assigned ID, unchanged active baseline, and one exact draft", () => {
  const keyPair = keys();
  const env = {
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      pinnedEd25519PublicKeyBase64(keyPair.publicKey),
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
  };
  const baseline = normalizeVercelWafProviderConfiguration(baselineFirewall(), {
    stage: "BASELINE_CAPTURE",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    configurationVersion: "10",
    runOwnedRuleName,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
  });
  const request = {
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    dispatchResultId: "51000000-0000-4000-8000-000000000001",
    dispatchId: "51000000-0000-4000-8000-000000000002",
    dispatchRequestId: "51000000-0000-4000-8000-000000000003",
    wafEpochId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    transitionRequestId: "51000000-0000-4000-8000-000000000004",
    requestFingerprint: "1".repeat(64),
    dispatchStep: "CRITICAL_RULE_INSERT",
    purpose: "REHEARSAL",
    transitionMode: "REHEARSAL",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
    candidateDeploymentId: candidateId,
    candidateCommitSha: candidateSha,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: "51000000-0000-4000-8000-000000000005",
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineConfigurationEtag: baseline.etag,
    baselineConfigurationIdentityFingerprint:
      baseline.configurationIdentityFingerprint,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    baselineOrderedCustomRulesFingerprint:
      baseline.orderedCustomRulesFingerprint,
    providerIntentFingerprint: "2".repeat(64),
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      runOwnedInsert.runOwnedInsertDocumentFingerprint,
  };
  const critical = firewall({ version: "draft-11" });
  const { version: _ignoredDraftVersion, ...providerDraft } = critical.active;
  const draft = {
    ...structuredClone(providerDraft),
    changes: [{ action: "rules.insert", id: null }],
  };
  const firewallPayload = {
    active: structuredClone(baselineFirewall().active),
    activeVersion: structuredClone(baselineFirewall().activeVersion),
    draft,
    versions: [],
  };
  const providerResponse = { status: "accepted" };
  const envelope = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "TARGET_CONFIRMED",
    providerResponse,
    firewallPayload,
    privateKey: keyPair.privateKey,
    now,
  });
  const verified = verifyVercelWafRuleInsertDispatchResult(envelope, {
    request,
    env,
    now: now + 1_000,
  });
  assert.equal(verified.outcomeStatus, "TARGET_CONFIRMED");
  assert.equal(verified.providerResponseObserved, true);
  assert.equal(verified.providerResponseStatus, null);
  assert.equal(verified.providerAssignedRuleId, ruleId);
  assert.equal(verified.runOwnedRuleName, runOwnedRuleName);
  assert.equal(verified.activeCustomRuleCount, 0);
  assert.equal(verified.draftCustomRuleCount, 1);
  assert.equal(verified.draftConfigurationVersion, "DRAFT");
  assert.equal(verified.pendingDraftChangeCount, 1);
  assert.equal(verified.runOwnedRulePrecedence, 0);
  assert.equal(verified.signatureVerified, true);

  const recovered = verifyVercelWafRuleInsertDispatchResult(
    createVercelWafRuleInsertDispatchResult({
      request,
      outcomeStatus: "TARGET_CONFIRMED",
      providerResponseObserved: false,
      firewallPayload,
      privateKey: keyPair.privateKey,
      now,
    }),
    { request, env, now: now + 1_000 },
  );
  assert.equal(recovered.providerResponseObserved, false);
  assert.equal(recovered.providerResponseStatus, null);
  assert.equal(recovered.providerResponseFingerprint, null);
  assert.match(recovered.providerReadbackFingerprint, /^[0-9a-f]{64}$/);

  const rejected = verifyVercelWafRuleInsertDispatchResult(
    createVercelWafRuleInsertDispatchResult({
      request,
      outcomeStatus: "PROVIDER_REJECTED",
      providerResponse: { error: { code: "forbidden" } },
      providerResponseStatus: 403,
      privateKey: keyPair.privateKey,
      now,
    }),
    { request, env, now: now + 1_000 },
  );
  assert.equal(rejected.outcomeStatus, "PROVIDER_REJECTED");
  assert.equal(rejected.providerResponseObserved, true);
  assert.equal(rejected.providerResponseStatus, 403);
  assert.match(rejected.providerResponseFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(rejected.providerReadbackFingerprint, null);
  assert.equal(rejected.draftSemanticConfiguration, null);
  assert.throws(() => createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "PROVIDER_REJECTED",
    providerResponse: { error: "redirect" },
    providerResponseStatus: 302,
    privateKey: keyPair.privateKey,
    now,
  }), (error) =>
    error.code === "STEP11_6_VERCEL_WAF_RULE_INSERT_REJECTION_INVALID");

  const wrongAssignedId = structuredClone(firewallPayload);
  wrongAssignedId.draft.rules[0].id = "provider-assigned-other";
  const providerAssignedOther = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "TARGET_CONFIRMED",
    providerResponse,
    firewallPayload: wrongAssignedId,
    privateKey: keyPair.privateKey,
    now,
  });
  assert.equal(providerAssignedOther.evidence.providerAssignedRuleId,
    "provider-assigned-other");

  const activeDrift = structuredClone(firewallPayload);
  activeDrift.active.version = "11";
  activeDrift.activeVersion.version = "11";
  assert.throws(() => createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "TARGET_CONFIRMED",
    providerResponse,
    firewallPayload: activeDrift,
    privateKey: keyPair.privateKey,
    now,
  }), (error) => new Set([
    "STEP11_6_VERCEL_FIREWALL_ACTIVE_VERSION_UNLINKED",
    "STEP11_6_VERCEL_WAF_RULE_INSERT_BASELINE_DRIFT",
  ]).has(error.code));
});

test("signed RULE_INSERT OUTCOME_UNKNOWN is terminal evidence with no target proof", () => {
  const keyPair = keys();
  const env = {
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      pinnedEd25519PublicKeyBase64(keyPair.publicKey),
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
  };
  const baseline = normalizeVercelWafProviderConfiguration(baselineFirewall(), {
    stage: "BASELINE_CAPTURE",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    configurationVersion: "10",
    runOwnedRuleName,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
  });
  const request = {
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    dispatchResultId: "52000000-0000-4000-8000-000000000001",
    dispatchId: "52000000-0000-4000-8000-000000000002",
    dispatchRequestId: "52000000-0000-4000-8000-000000000003",
    wafEpochId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    transitionRequestId: "52000000-0000-4000-8000-000000000004",
    requestFingerprint: "3".repeat(64),
    dispatchStep: "CRITICAL_DRAFT_ACTIVATE", purpose: "REHEARSAL",
    transitionMode: "REHEARSAL",
    projectId: PRODUCTION_VERCEL_PROJECT_ID, teamId,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
    candidateDeploymentId: candidateId,
    candidateCommitSha: candidateSha,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: "52000000-0000-4000-8000-000000000005",
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineConfigurationEtag: baseline.etag,
    baselineConfigurationIdentityFingerprint:
      baseline.configurationIdentityFingerprint,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    baselineOrderedCustomRulesFingerprint:
      baseline.orderedCustomRulesFingerprint,
    providerIntentFingerprint: "4".repeat(64),
    runOwnedRuleName, runOwnedRuleNonce,
    runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      runOwnedInsert.runOwnedInsertDocumentFingerprint,
  };
  const envelope = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "OUTCOME_UNKNOWN",
    privateKey: keyPair.privateKey,
    now,
  });
  const verified = verifyVercelWafRuleInsertDispatchResult(envelope, {
    request, env, now: now + 1_000,
  });
  assert.equal(verified.outcomeStatus, "OUTCOME_UNKNOWN");
  assert.equal(verified.providerResponseObserved, false);
  assert.equal(verified.providerResponseStatus, null);
  assert.equal(verified.providerAssignedRuleId, null);
  assert.equal(verified.providerReadbackFingerprint, null);
  assert.equal(verified.draftSemanticConfiguration, null);
  const baselineActivateRequest = {
    ...request,
    dispatchResultId: "53000000-0000-4000-8000-000000000001",
    dispatchId: "53000000-0000-4000-8000-000000000002",
    dispatchRequestId: "53000000-0000-4000-8000-000000000003",
    transitionRequestId: "53000000-0000-4000-8000-000000000004",
    baselineEvidenceId: "53000000-0000-4000-8000-000000000005",
    dispatchStep: "BASELINE_VERSION_ACTIVATE",
  };
  const baselineActivateUnknown = createVercelWafRuleInsertDispatchResult({
    request: baselineActivateRequest,
    outcomeStatus: "OUTCOME_UNKNOWN",
    privateKey: keyPair.privateKey,
    now,
  });
  assert.equal(verifyVercelWafRuleInsertDispatchResult(
    baselineActivateUnknown,
    { request: baselineActivateRequest, env, now: now + 1_000 },
  ).dispatchStep, "BASELINE_VERSION_ACTIVATE");
  assert.throws(() => createVercelWafRuleInsertDispatchResult({
    request: baselineActivateRequest,
    outcomeStatus: "TARGET_CONFIRMED",
    privateKey: keyPair.privateKey,
    now,
  }), (error) =>
    error.code === "STEP11_6_VERCEL_WAF_RULE_INSERT_OUTCOME_INVALID");
  assert.throws(() => createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "OUTCOME_UNKNOWN",
    providerResponse: { status: "ambiguous" },
    privateKey: keyPair.privateKey,
    now,
  }), (error) =>
    error.code === "STEP11_6_VERCEL_WAF_RULE_INSERT_UNKNOWN_TARGET_FORBIDDEN");
});

test("a duplicate unscoped Preview credential record fails closed even beside an exact branch record", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const payload = replaceUnrelatedEnvironmentRecords(exactPayload, [
    fixtureEnvironmentRecord({ key: "PRODUCTION_GOOGLE_PRIVATE_KEY" }),
  ]);
  assert.throws(() => normalizeFixtureEnvironment(payload, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE");
});

test("credential evidence drives the reviewed project-wide Preview exception", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const normalized = normalizeFixtureEnvironment(exactPayload, selectedRequest);
  assert.equal(normalized.records.filter((record) =>
    record[3].length === 1 && record[3][0] === "preview" &&
    record[4] === null).length, 7);
  assert.equal(normalized.records.filter((record) =>
    record[1] === "GOOGLE_SHEETS_ID").length, 2);
  assert.equal(normalized.reviewedResourceRecordCount, 12);
  assert.equal(normalized.hiddenProductionEnvCount, 0);
});

test("provider environment census fails closed unless hidden Production count is explicit zero", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const missing = structuredClone(exactPayload);
  delete missing.hiddenProductionEnvCount;
  assert.throws(() => normalizeFixtureEnvironment(missing, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID");
  const hidden = structuredClone(exactPayload);
  hidden.hiddenProductionEnvCount = 1;
  assert.throws(() => normalizeFixtureEnvironment(hidden, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID");
});

test("every relevant provider record version contributes to the signed environment fingerprint", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const exact = normalizeFixtureEnvironment(exactPayload, selectedRequest);
  const driftPayload = structuredClone(exactPayload);
  const unreviewedRuntime = driftPayload.envs.find((record) =>
    record.key === "PRODUCTION_GOOGLE_PRIVATE_KEY");
  assert.ok(unreviewedRuntime);
  unreviewedRuntime.updatedAt += 1;
  const drift = normalizeFixtureEnvironment(driftPayload, selectedRequest);
  assert.equal(drift.recordCount, exact.recordCount);
  assert.notEqual(drift.recordsFingerprint, exact.recordsFingerprint);
  assert.notDeepEqual(drift.records, exact.records);
});

test("a re-signed reviewed environment metadata substitution is rejected", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const keyPair = keys();
  const envelope = structuredClone(await createVercelProviderAttestation({
    request: selectedRequest,
    privateKey: keyPair.privateKey,
    readApi: fixture.readApi,
    _testOnlyEnvironmentResourceReview: fixture.certifiedEnvironmentReview,
    now,
  }));
  const reviewedId = fixture.certifiedEnvironmentReview.records[0][0];
  const signedRecord = envelope.attestation.redactedEnvironmentScopeRecords
    .find((record) => record[0] === reviewedId);
  assert.ok(signedRecord);
  signedRecord[6] += 1;
  const resigned = resignEnvelope(envelope, keyPair.privateKey);
  assert.throws(() => verifyVercelProviderAttestation(resigned, {
    env: {
      [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
        pinnedEd25519PublicKeyBase64(keyPair.publicKey),
      [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
    },
    request: selectedRequest,
    expectedRoutingRuleRevision: "17",
    now: now + 10_000,
  }), (error) => error.code === "STEP11_6_VERCEL_ENVIRONMENT_RESOURCE_DRIFT");
});

test("a project-wide Preview tuple outside the credential evidence contract fails closed", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const branch = "feature/mock-tournament-qa-integration";
  const payload = replaceUnrelatedEnvironmentRecords(exactPayload, [
    fixtureEnvironmentRecord({ key: "GOOGLE_SHEETS_ID_UNREVIEWED" }),
    fixtureEnvironmentRecord({ key: "GOOGLE_SHEETS_ID_UNREVIEWED", gitBranch: branch }),
  ]);
  assert.throws(() => normalizeFixtureEnvironment(payload, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE" &&
      error.safeDiagnostics?.unsafeBranchScope === true);
});

test("unreviewed project-wide Preview credentials still fail closed", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  for (const key of [
    "PRODUCTION_SUPABASE_SECRET_KEY",
    "SUPABASE_SCORING_MIRROR_SECRET_KEY",
  ]) {
    const payload = replaceUnrelatedEnvironmentRecords(exactPayload, [
      fixtureEnvironmentRecord({ key }),
    ]);
    assert.throws(() => normalizeFixtureEnvironment(payload, selectedRequest), (error) =>
      error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE");
  }
});

test("a relevant record for another Preview branch fails closed", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const payload = replaceUnrelatedEnvironmentRecords(exactPayload, [
    fixtureEnvironmentRecord({
      key: "NEXT_PUBLIC_SUPABASE_AUTH_URL",
      gitBranch: "unreviewed-branch",
    }),
  ]);
  assert.throws(() => normalizeFixtureEnvironment(payload, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE" &&
      error.safeDiagnostics?.unsafeBranchScope === true &&
      error.safeDiagnostics?.missingRequiredCount === 0);
});

test("a shadowed project-wide Preview default requires its same-name candidate override", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const payload = {
    ...exactPayload,
    envs: exactPayload.envs.filter((record) => !(record.key === "SCORING_AUTHORITY" &&
      record.gitBranch === "feature/mock-tournament-qa-integration")),
  };
  assert.throws(() => normalizeFixtureEnvironment(payload, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE" &&
      error.safeDiagnostics?.unsafeBranchScope === true &&
      error.safeDiagnostics?.missingRequiredCount === 0);
});

test("a required candidate environment record cannot be replaced by its project-wide fallback", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const exactPayload = await fixture.readApi(
    `/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${teamId}`,
  );
  const payload = {
    ...exactPayload,
    envs: exactPayload.envs.filter((record) => !(record.key === "GOOGLE_SHEETS_ID" &&
      record.gitBranch === "feature/mock-tournament-qa-integration")),
  };
  assert.throws(() => normalizeFixtureEnvironment(payload, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE" &&
      error.safeDiagnostics?.missingRequiredCount === 1);
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
        if (deployment.uid === candidateId) deployment.meta.githubCommitRef = "unreviewed-branch";
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
        if (deployment.uid === candidateId) deployment.meta.githubCommitSha = wrongSha;
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
        if (deployment.uid === candidateId) {
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
        if (deployment.uid === candidateId) deployment.target = "production";
      }
    }
    return payload;
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
});

test("every retained provider record is exact and cannot be omitted or relabeled", async () => {
  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const scope = await collectVercelDeploymentScope(fixture.readApi, selectedRequest);
  assert.equal(scope.liveRecordCount, 1293);
  const retainedProvider = productionLegacyDeploymentInventory()
    .providerRecordTuples.find((tuple) => tuple[1] !== null && tuple[5] !== null);

  const mutations = [
    (value) => ({ ...value, meta: { ...value.meta, githubCommitSha: "8".repeat(40) } }),
    (value) => ({ ...value, target: "production" }),
    (value) => ({ ...value, target: "preview" }),
    (value) => {
      const changed = { ...value };
      delete changed.target;
      return changed;
    },
    (value) => ({ ...value, readyState: "ERROR" }),
    (value) => ({ ...value, meta: { ...value.meta, githubCommitRef: "main" } }),
    (value) => ({ ...value, url: "unreviewed-preview.vercel.app" }),
  ];
  for (const mutation of mutations) {
    const driftFixture = provider(selectedRequest);
    await assert.rejects(() => collectVercelDeploymentScope(
      async (path) => {
        const payload = await driftFixture.readApi(path);
        if (path.startsWith("/v6/deployments?")) {
          payload.deployments = payload.deployments.map((value) =>
            value.uid === retainedProvider[0]
              ? mutation(value) : value);
        }
        return payload;
      },
      selectedRequest,
    ), (error) => error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
  }

  const missingFixture = provider(selectedRequest);
  await assert.rejects(() => collectVercelDeploymentScope(async (path) => {
    const payload = await missingFixture.readApi(path);
    if (path.startsWith("/v6/deployments?")) {
      payload.deployments = payload.deployments.filter((value) =>
        value.uid !== retainedProvider[0]);
    }
    return payload;
  }, selectedRequest), (error) =>
    error.code === "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT");
});

test("persistent signer is read/installed only through the fixed macOS Keychain item", async () => {
  const pair = keys();
  const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const storedToken = `${VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SECRET_PREFIX}${
    Buffer.from(privatePem.trim(), "utf8").toString("base64url")}`;
  const readCalls = [];
  const loaded = await readKeychainAttestationPrivateKey({
    execFileImpl: async (...args) => {
      readCalls.push(args);
      return { stdout: storedToken };
    },
  });
  assert.equal(loaded, privatePem.trim());
  assert.deepEqual(readCalls[0][1], [
    "find-generic-password",
    "-a", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
    "-s", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
    "-w",
  ]);
  assert.equal(readCalls[0][2].timeout, 15_000);
  assert.equal(readCalls[0][2].killSignal, "SIGKILL");
  assert.ok(!JSON.stringify(readCalls).includes(privatePem));

  let installArgs;
  let interactiveStdin = "";
  let installedToken = "";
  let readbackCount = 0;
  const installed = await installKeychainAttestationSigner({
    execFileImpl: async () => {
      readbackCount += 1;
      if (readbackCount === 1) {
        const error = new Error("not found");
        error.code = 44;
        throw error;
      }
      return { stdout: installedToken };
    },
    spawnImpl: (binary, args) => {
      installArgs = { binary, args };
      const child = new EventEmitter();
      child.stdin = {
        end(value) {
          interactiveStdin = value;
          installedToken = value.match(/ -w ([A-Za-z0-9_-]+)\nquit\n$/)?.[1] || "";
          queueMicrotask(() => child.emit("exit", 0));
        },
      };
      return child;
    },
  });
  assert.equal(installArgs.binary, "/usr/bin/security");
  assert.deepEqual(installArgs.args, ["-i"]);
  assert.ok(!JSON.stringify(installArgs).includes("BEGIN PRIVATE KEY"));
  assert.ok(interactiveStdin.startsWith(
    `add-generic-password -a ${VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT} ` +
    `-s ${VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE} ` +
    "-l \"BaggerInv Step 11.6 Vercel provider attester Ed25519 key\" " +
    "-T /usr/bin/security -w STEP11_6_ED25519_PKCS8_B64_V1_",
  ));
  assert.match(interactiveStdin,
    /^add-generic-password [^\r\n]+ -w STEP11_6_ED25519_PKCS8_B64_V1_[A-Za-z0-9_-]+\nquit\n$/);
  assert.doesNotMatch(interactiveStdin, /BEGIN PRIVATE KEY| -U(?: |\n)| -A(?: |\n)/);
  assert.equal(installedToken.startsWith(VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SECRET_PREFIX), true);
  assert.equal(readbackCount, 2);
  assert.match(installed.publicKeyBase64, /^[A-Za-z0-9+/=]+$/);
  assert.match(installed.signerKeyFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(installed.recovered, false);

  let spawnCalled = false;
  const recovered = await installKeychainAttestationSigner({
    execFileImpl: async () => ({ stdout: storedToken }),
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

  const attesterSource = readFileSync(new URL(
    "../tools/step11-6-operator/vercel-provider-attester.mjs",
    import.meta.url,
  ), "utf8");
  assert.match(attesterSource, /const KEYCHAIN_READ_TIMEOUT_MS = 15_000/);
  assert.match(attesterSource, /const KEYCHAIN_ADD_TIMEOUT_MS = 30_000/);
  assert.match(attesterSource, /child\.kill\("SIGKILL"\)/);
  assert.match(attesterSource, /timeoutId\.unref\?\.\(\)/);
  assert.doesNotMatch(attesterSource, /add-generic-password[\s\S]{0,500}"-U"/);
  assert.doesNotMatch(attesterSource, /add-generic-password[\s\S]{0,500}"-A"/);

  await assert.rejects(() => readKeychainAttestationPrivateKey({
    execFileImpl: async () => ({ stdout: privatePem }),
  }), (error) =>
    error.code === "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID");
});

test("Keychain signer install recovers a lost add response and rejects an invalid duplicate", async () => {
  let storedToken = "";
  let reads = 0;
  const recovered = await installKeychainAttestationSigner({
    execFileImpl: async () => {
      reads += 1;
      if (reads === 1) {
        const error = new Error("not found");
        error.code = 44;
        throw error;
      }
      return { stdout: storedToken };
    },
    spawnImpl: (binary, args) => {
      assert.equal(binary, "/usr/bin/security");
      assert.deepEqual(args, ["-i"]);
      const child = new EventEmitter();
      child.stdin = {
        end(value) {
          storedToken = value.match(/ -w ([A-Za-z0-9_-]+)\nquit\n$/)?.[1] || "";
          queueMicrotask(() => child.emit("error", new Error("response lost")));
        },
      };
      return child;
    },
  });
  assert.equal(recovered.recovered, false);
  assert.match(recovered.signerKeyFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(reads, 2);

  const concurrentPair = keys();
  const concurrentPem = concurrentPair.privateKey.export({ type: "pkcs8", format: "pem" });
  const concurrentToken = `${VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SECRET_PREFIX}${
    Buffer.from(concurrentPem.trim(), "utf8").toString("base64url")}`;
  let concurrentReads = 0;
  const concurrent = await installKeychainAttestationSigner({
    execFileImpl: async () => {
      concurrentReads += 1;
      if (concurrentReads === 1) {
        const error = new Error("not found");
        error.code = 44;
        throw error;
      }
      return { stdout: concurrentToken };
    },
    spawnImpl: () => {
      const child = new EventEmitter();
      child.stdin = {
        end() {
          // The interactive shell reports success even though its inner add
          // observed the concurrently-created exact item as a duplicate.
          queueMicrotask(() => child.emit("exit", 0));
        },
      };
      return child;
    },
  });
  assert.equal(concurrent.recovered, true);
  assert.equal(concurrent.publicKeyBase64,
    pinnedEd25519PublicKeyBase64(concurrentPair.publicKey));

  let invalidReads = 0;
  await assert.rejects(() => installKeychainAttestationSigner({
    execFileImpl: async () => {
      invalidReads += 1;
      if (invalidReads === 1) {
        const error = new Error("not found");
        error.code = 44;
        throw error;
      }
      return { stdout: "invalid duplicate" };
    },
    spawnImpl: () => {
      const child = new EventEmitter();
      child.stdin = {
        end() { queueMicrotask(() => child.emit("exit", 73)); },
      };
      return child;
    },
  }), (error) =>
    error.code === "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID");
});

test("provider attestation overrides reject accessors, Proxies, and spoofed contexts", async () => {
  const accessor = {};
  Object.defineProperty(accessor, "readApi", {
    enumerable: true,
    get() { return async () => ({}); },
  });
  await assert.rejects(
    createVercelProviderAttestation(accessor),
    { code: "STEP11_6_VERCEL_ENVIRONMENT_TEST_OVERRIDE_FORBIDDEN" },
  );
  await assert.rejects(
    createVercelProviderAttestation(new Proxy({}, {})),
    { code: "STEP11_6_VERCEL_ENVIRONMENT_TEST_OVERRIDE_FORBIDDEN" },
  );

  const selectedRequest = request();
  const fixture = provider(selectedRequest);
  const keyPair = generateKeyPairSync("ed25519");
  const previous = process.env.NODE_TEST_CONTEXT;
  try {
    process.env.NODE_TEST_CONTEXT = "truthy-but-not-child-v8";
    await assert.rejects(
      createVercelProviderAttestation({
        request: selectedRequest,
        privateKey: keyPair.privateKey,
        readApi: fixture.readApi,
        now,
        _testOnlyEnvironmentResourceReview:
          fixture.certifiedEnvironmentReview,
      }),
      { code: "STEP11_6_VERCEL_ENVIRONMENT_TEST_OVERRIDE_FORBIDDEN" },
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
});

test("local WAF evidence attester signs exact request/readback files without provider calls", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "bagger-waf-attester-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const keyPair = keys();
  const selectedRequest = wafEvidenceRequest({
    stage: "BASELINE_CAPTURE",
    evidenceRequestId: "71000000-0000-4000-8000-000000000001",
    transitionRequestId: "71000000-0000-4000-8000-000000000002",
    expectedConfigurationVersion: "10",
  });
  const requestPath = path.join(directory, "request.json");
  const readbackPath = path.join(directory, "readback.json");
  const outputPath = path.join(directory, "evidence.json");
  writeFileSync(requestPath, JSON.stringify({
    wafProviderEvidenceRequest: selectedRequest,
  }));
  writeFileSync(readbackPath, JSON.stringify(baselineFirewall()));
  let providerCallCount = 0;
  const serialized = await runLocalVercelWafProviderAttester({
    requestPath,
    firewallReadbackPath: readbackPath,
    outputPath,
    execFileImpl: async () => {
      providerCallCount += 1;
      throw new Error("provider calls are forbidden");
    },
    privateKeyLoader: async () => keyPair.privateKey,
    now,
  });
  assert.equal(providerCallCount, 0);
  assert.equal(serialized, readFileSync(outputPath, "utf8"));
  assert.equal(statSync(outputPath).mode & 0o777, 0o600);
  const envelope = JSON.parse(serialized);
  const verified = verifyVercelWafProviderEvidence(envelope, {
    request: selectedRequest,
    env: {
      [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
        pinnedEd25519PublicKeyBase64(keyPair.publicKey),
      [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
    },
    now: now + 1_000,
  });
  assert.equal(verified.candidateDeploymentId, candidateId);
  assert.equal(verified.candidateCommitSha, candidateSha);
  assert.equal(verified.candidateDeploymentTarget, "PREVIEW");
  await assert.rejects(() => runLocalVercelWafProviderAttester({
    requestPath,
    firewallReadbackPath: readbackPath,
    outputPath,
    privateKeyLoader: async () => keyPair.privateKey,
    now,
  }), (error) => error.code === "EEXIST");
});

test("local RULE_INSERT result attester signs exact confirmed files and unknown outcomes without provider calls", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "bagger-waf-result-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const keyPair = keys();
  const baseline = normalizeVercelWafProviderConfiguration(baselineFirewall(), {
    stage: "BASELINE_CAPTURE",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    configurationVersion: "10",
    runOwnedRuleName,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
  });
  const resultRequest = {
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    dispatchResultId: "72000000-0000-4000-8000-000000000001",
    dispatchId: "72000000-0000-4000-8000-000000000002",
    dispatchRequestId: "72000000-0000-4000-8000-000000000003",
    wafEpochId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    transitionRequestId: "72000000-0000-4000-8000-000000000004",
    requestFingerprint: "7".repeat(64),
    dispatchStep: "CRITICAL_RULE_INSERT",
    purpose: "REHEARSAL",
    transitionMode: "REHEARSAL",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    candidateAliasOrigin: candidateAlias,
    candidateImmutableOrigin: candidateImmutable,
    candidateDeploymentId: candidateId,
    candidateCommitSha: candidateSha,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: "72000000-0000-4000-8000-000000000005",
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineConfigurationEtag: baseline.etag,
    baselineConfigurationIdentityFingerprint:
      baseline.configurationIdentityFingerprint,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    baselineOrderedCustomRulesFingerprint:
      baseline.orderedCustomRulesFingerprint,
    providerIntentFingerprint: "8".repeat(64),
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint: runOwnedInsert.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      runOwnedInsert.runOwnedInsertDocumentFingerprint,
  };
  const requestPath = path.join(directory, "request.json");
  const providerResponsePath = path.join(directory, "response.json");
  const readbackPath = path.join(directory, "readback.json");
  writeFileSync(requestPath, JSON.stringify({
    wafRuleInsertDispatchResultRequest: resultRequest,
  }));
  writeFileSync(providerResponsePath, JSON.stringify({ status: "accepted" }));
  const critical = firewall({ version: "draft-11" });
  const { version: _ignored, ...draftConfig } = critical.active;
  writeFileSync(readbackPath, JSON.stringify({
    active: structuredClone(baselineFirewall().active),
    activeVersion: structuredClone(baselineFirewall().activeVersion),
    draft: {
      ...draftConfig,
      changes: [{ action: "rules.insert", id: null }],
    },
    versions: [],
  }));
  let providerCallCount = 0;
  const execFileImpl = async () => {
    providerCallCount += 1;
    throw new Error("provider calls are forbidden");
  };
  const confirmed = JSON.parse(await runLocalVercelWafRuleInsertResultAttester({
    requestPath,
    outcomeStatus: "TARGET_CONFIRMED",
    providerResponsePath,
    firewallReadbackPath: readbackPath,
    execFileImpl,
    privateKeyLoader: async () => keyPair.privateKey,
    now,
  }));
  assert.equal(providerCallCount, 0);
  assert.equal(confirmed.evidence.outcomeStatus, "TARGET_CONFIRMED");
  assert.equal(confirmed.evidence.candidateDeploymentTarget, "PREVIEW");
  assert.equal(confirmed.evidence.providerAssignedRuleId, ruleId);

  const unknown = JSON.parse(await runLocalVercelWafRuleInsertResultAttester({
    requestPath,
    outcomeStatus: "OUTCOME_UNKNOWN",
    execFileImpl,
    privateKeyLoader: async () => keyPair.privateKey,
    now,
  }));
  assert.equal(providerCallCount, 0);
  assert.equal(unknown.evidence.outcomeStatus, "OUTCOME_UNKNOWN");
  assert.equal(unknown.evidence.providerResponseFingerprint, null);
  await assert.rejects(() => runLocalVercelWafRuleInsertResultAttester({
    requestPath,
    outcomeStatus: "OUTCOME_UNKNOWN",
    providerResponsePath,
    privateKeyLoader: async () => keyPair.privateKey,
    now,
  }), (error) =>
    error.code === "STEP11_6_VERCEL_WAF_RESULT_ATTESTER_ARGUMENT_INVALID");
});
