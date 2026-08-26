import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  normalizeProductionWriterQuiesceEvidenceInput,
  probeProductionWriterQuiesceOrigins,
  productionLegacyDeploymentInventory,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_VECTOR_COVERAGE_MASK,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
  PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS,
} from "../lib/production-google-writer-fence-quiesce.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from
  "../lib/google-service-account-credential-context.js";
import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
} from "../lib/production-google-credential-confinement.js";

const candidateDeploymentId = "dpl_CandidateStep116A1";
const candidateCommit = "7".repeat(40);
const ruleId = "writer-quiesce-rule";
const ruleRevision = "revision-17";

function environment() {
  return {
    resources: {
      candidateHostname:
        "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app",
      deploymentHostname:
        "bagger-a1b2c3d4e-sandbagger-invitational.vercel.app",
      candidateDeploymentId,
      commitSha: candidateCommit,
      writerQuiesceRuleId: ruleId,
      writerQuiesceRuleRevision: ruleRevision,
    },
  };
}

function input(overrides = {}) {
  return {
    quiescePurpose: "REHEARSAL",
    routingRule: {
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      ruleId,
      revision: ruleRevision,
      scope: PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
      projectWide: true,
      action: "DENY",
      requestPathOperator: "DOES_NOT_EQUAL",
      requestPath: PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
      methodOperator: "IS_NOT_ANY_OF",
      methods: ["OPTIONS", "GET", "HEAD"],
    },
    ...overrides,
  };
}

function providerAttestationFor(selectedEnvironment = environment(), additions = []) {
  const retained = productionLegacyDeploymentInventory();
  const candidateTuple = [
    selectedEnvironment.resources.candidateDeploymentId,
    selectedEnvironment.resources.commitSha,
    `https://${selectedEnvironment.resources.deploymentHostname}`,
    "FEATURE_PREVIEW", "READY", "GIT",
  ];
  const records = [...retained.recordTuples.map((tuple) => [...tuple]),
    ...PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.map((tuple) => [...tuple]),
    ...additions.map((tuple) => [...tuple]), candidateTuple]
    .sort((left, right) => `${left[0]}\n${left[2]}` < `${right[0]}\n${right[2]}` ? -1 : 1);
  return {
    signatureVerified: true,
    credentialConfinementEvidenceSchema:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
    credentialConfinementRecordCount:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
    credentialConfinementRecordsFingerprint:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
    credentialConfinementEvidenceFingerprint:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
    liveOriginInventoryCount: records.length,
    liveOriginInventoryFingerprint:
      createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    liveOriginInventoryRecords: records,
  };
}

function normalize(selectedInput = input(), selectedEnvironment = environment(), additions = []) {
  return normalizeProductionWriterQuiesceEvidenceInput(
    selectedInput,
    selectedEnvironment,
    { providerAttestation: providerAttestationFor(selectedEnvironment, additions) },
  );
}

function providerAttestationWithRecords(records) {
  return {
    ...providerAttestationFor(),
    liveOriginInventoryCount: records.length,
    liveOriginInventoryFingerprint:
      createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    liveOriginInventoryRecords: records,
  };
}

function normalizeWithProvider(providerAttestation, selectedEnvironment = environment()) {
  return normalizeProductionWriterQuiesceEvidenceInput(
    input(),
    selectedEnvironment,
    { providerAttestation },
  );
}

test("retained complete 1,140-origin v2 inventory is expanded and re-hashed exactly", () => {
  const retained = productionLegacyDeploymentInventory();
  assert.equal(retained.recordCount, PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT);
  assert.equal(retained.vercelProjectId, PRODUCTION_VERCEL_PROJECT_ID);
  assert.equal(retained.recordsFingerprint,
    PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT);
  assert.equal(createHash("sha256").update(JSON.stringify(retained.recordTuples)).digest("hex"),
    PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT);
  assert.deepEqual([...retained.records].map((record) => record.deploymentId),
    [...retained.records].map((record) => record.deploymentId).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0));
  assert.equal(retained.records.filter((record) => record.sha === null).length, 1);
  assert.equal(retained.records.filter((record) =>
    record.sourceProvenance === "VERCEL_API_RESOLVED_GIT").length, 9);
  assert.equal(retained.records.filter((record) =>
    record.scopeClass === "MAIN_PRODUCTION").length, 458);
  assert.equal(retained.records.filter((record) =>
    record.scopeClass === "FEATURE_PREVIEW").length, 682);
  assert.equal(retained.paginationEvidence.productionTarget.remainingLoadMore, false);
  assert.equal(retained.paginationEvidence.candidateBranchPreview.remainingLoadMore, false);
  assert.deepEqual(retained.recordTuple, [
    "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
    "sourceProvenance",
  ]);
  assert.deepEqual(retained.statusSemantics, {
    READY: { publiclyReachable: true, writerCapable: true },
    ERROR: { publiclyReachable: false, writerCapable: false },
    BLOCKED: { publiclyReachable: false, writerCapable: false },
  });
  assert.ok(retained.records.some((record) =>
    record.deploymentId === "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2"));
  assert.ok(retained.records.some((record) =>
    record.deploymentId === "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j"));
  assert.ok(retained.records.every((record) =>
    Object.isFrozen(record) && Object.isFrozen(record.credentialCapabilities)));
  assert.ok(new Set(retained.records.map((record) => record.sha).filter(Boolean)).size <
    retained.records.filter((record) => record.sha !== null).length,
  "redeploy SHAs are intentionally not a uniqueness key");
});

test("normalization adds exact fixed and candidate origins without client inventory", () => {
  const normalized = normalize();
  assert.equal(normalized.originInventoryCount, 1140);
  assert.equal(normalized.originInventoryFingerprint,
    PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT);
  assert.equal(normalized.purpose, "REHEARSAL");
  assert.equal(normalized.candidateDeploymentId, candidateDeploymentId);
  assert.ok(normalized.probeOrigins.includes("https://baggerinv.com"));
  assert.ok(normalized.probeOrigins.includes("https://www.baggerinv.com"));
  assert.ok(normalized.probeOrigins.includes("https://bagger-inv.vercel.app"));
  assert.ok(normalized.probeOrigins.includes(
    "https://bagger-inv-git-main-sandbagger-invitational.vercel.app"));
  assert.ok(normalized.probeOrigins.includes(
    "https://bagger-a1b2c3d4e-sandbagger-invitational.vercel.app"));
  const expectedOriginCount = normalized.liveOriginInventoryCount + 5;
  const expectedTargetCount = expectedOriginCount * normalized.probeVectorCount;
  assert.equal(normalized.probeOrigins.length, expectedOriginCount);
  assert.equal(normalized.probeTargets.length, expectedTargetCount);
  assert.equal(normalized.probeVectorCoverageMask, 511);
  assert.deepEqual(normalized.probeTargets.slice(0, 9)
    .map(({ probeMethod, probePath }) => ({ probeMethod, probePath })),
  PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS);
  assert.throws(() => normalize(input({
    routingRule: { ...input().routingRule, action: "ALLOW" },
  })), (error) => error.code === "STEP11_6_WRITER_QUIESCE_RULE_INVALID");
  const collision = environment();
  collision.resources.candidateDeploymentId = "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j";
  assert.throws(() => normalize(input(), collision),
    (error) => error.code === "STEP11_6_WRITER_QUIESCE_CANDIDATE_INVENTORY_COLLISION");
});

test("signed live inventory uniqueness and reviewed-candidate collisions fail closed", () => {
  const exact = providerAttestationFor();
  assert.equal(exact.liveOriginInventoryCount, 1147);
  assert.equal(normalizeWithProvider(exact).liveOriginInventoryCount, 1147,
    "retained + six reviewed deployments + exact dynamic candidate is sufficient");

  const duplicateTupleRecords = [
    ...exact.liveOriginInventoryRecords.map((tuple) => [...tuple]),
    [...exact.liveOriginInventoryRecords[0]],
  ].sort((left, right) => {
    const a = `${left[0]}\n${left[2]}`;
    const b = `${right[0]}\n${right[2]}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  assert.throws(() => normalizeWithProvider(
    providerAttestationWithRecords(duplicateTupleRecords),
  ), (error) => error.code === "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID");

  const reviewed = PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS[0];
  const duplicateIdRecords = [
    ...exact.liveOriginInventoryRecords.map((tuple) => [...tuple]),
    [
      reviewed[0], candidateCommit,
      "https://bagger-duplicate-id-new-origin-sandbagger-invitational.vercel.app",
      "FEATURE_PREVIEW", "READY", "GIT",
    ],
  ].sort((left, right) => {
    const a = `${left[0]}\n${left[2]}`;
    const b = `${right[0]}\n${right[2]}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  assert.throws(() => normalizeWithProvider(
    providerAttestationWithRecords(duplicateIdRecords),
  ), (error) => error.code === "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID");

  const duplicateOriginRecords = [
    ...exact.liveOriginInventoryRecords.map((tuple) => [...tuple]),
    [
      "dpl_DuplicateOriginNewId01", candidateCommit, reviewed[2],
      "FEATURE_PREVIEW", "READY", "GIT",
    ],
  ].sort((left, right) => {
    const a = `${left[0]}\n${left[2]}`;
    const b = `${right[0]}\n${right[2]}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  assert.throws(() => normalizeWithProvider(
    providerAttestationWithRecords(duplicateOriginRecords),
  ), (error) => error.code === "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID");

  const idCollisionEnvironment = environment();
  idCollisionEnvironment.resources.candidateDeploymentId = reviewed[0];
  assert.throws(() => normalizeWithProvider(
    providerAttestationFor(idCollisionEnvironment), idCollisionEnvironment,
  ), (error) => error.code === "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID");

  const originCollisionEnvironment = environment();
  originCollisionEnvironment.resources.deploymentHostname = new URL(reviewed[2]).hostname;
  assert.throws(() => normalizeWithProvider(
    providerAttestationFor(originCollisionEnvironment), originCollisionEnvironment,
  ), (error) => error.code === "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID");
});

test("signed post-freeze deployments expand the immutable probe scope without changing retained evidence", () => {
  const addition = [
    "dpl_PostFreezeRelevant01",
    candidateCommit,
    "https://bagger-postfreeze-relevant-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT",
  ];
  const normalized = normalize(input(), environment(), [addition]);
  assert.equal(normalized.originInventoryCount, 1140,
    "the frozen retained artifact remains the receipt subset");
  assert.equal(normalized.liveOriginInventoryCount, 1148,
    "retained + reviewed candidates + signed addition + current candidate are live");
  assert.equal(normalized.probeOriginCount, 1153);
  assert.equal(normalized.probeTargetCount, 1153 * 9);
  assert.ok(normalized.probeOrigins.includes(addition[2]));
  assert.ok(normalized.liveOriginInventoryTuples.some((tuple) =>
    tuple[0] === addition[0] && tuple[2] === addition[2]));
});

test("full server probe requires exact Vercel deny markers and emits SQL-shaped evidence", async () => {
  const normalized = normalize();
  const probedVectors = new Set();
  const probedTargets = new Set();
  const fetchImpl = async (url, request) => {
    probedVectors.add(`${request.method} ${new URL(url).pathname}`);
    probedTargets.add(`${new URL(url).origin}\n${request.method}\n${new URL(url).pathname}`);
    return new Response("denied", {
      status: 403,
      headers: {
        "x-vercel-mitigated": "deny",
        server: "Vercel",
        "x-vercel-id": "cle1::iad1::probe-proof",
      },
    });
  };
  const proof = await probeProductionWriterQuiesceOrigins(normalized, {
    fetchImpl,
    concurrency: 64,
    now: Date.parse("2026-08-26T15:00:00.000Z"),
  });
  assert.equal(proof.probeCount, normalized.probeTargetCount);
  assert.equal(proof.deniedCount, normalized.probeTargetCount);
  assert.equal(proof.compactRecordCount, normalized.probeOriginCount);
  assert.equal(proof.unresolvedProbeCount, 0);
  assert.match(proof.edgeProofFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(proof.probeRecords[0].length, 11);
  assert.equal(proof.probeRecords[0][8],
    PRODUCTION_GOOGLE_WRITER_QUIESCE_VECTOR_COVERAGE_MASK);
  assert.equal(proof.probeRecords[0][9].length, 9);
  assert.ok(proof.probeRecords[0][9].every((fingerprint) =>
    /^[0-9a-f]{64}$/.test(fingerprint)));
  assert.ok(Buffer.byteLength(JSON.stringify(proof.probeRecords), "utf8") < 2_000_000,
    "compact durable evidence remains comfortably below common request-body limits");
  assert.deepEqual([...probedVectors].sort(), PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS
    .map((record) => `${record.probeMethod} ${record.probePath}`).sort());
  assert.ok(proof.probeRecords.every((record) =>
    record[8] === 511 && record[10] === "2026-08-26T15:00:00.000Z"));
  const fixed = proof.probeRecords.find((record) => record[0] === "https://baggerinv.com");
  assert.equal(fixed[1], "FIXED_ALIAS");
  assert.equal(fixed[2], null);
  assert.deepEqual(fixed[7], []);
  const candidate = proof.probeRecords.find((record) =>
    record[1] === "CANDIDATE_IMMUTABLE");
  assert.deepEqual(candidate[7], [
    "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
    "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
    "PRODUCTION_WORKBOOK_SELECTOR",
  ]);
  for (const reviewed of PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS) {
    const record = proof.probeRecords.find((value) => value[0] === reviewed[2]);
    assert.equal(record[3], reviewed[1]);
    assert.equal(record[8], PRODUCTION_GOOGLE_WRITER_QUIESCE_VECTOR_COVERAGE_MASK);
    assert.equal(record[9].length, PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS.length);
    assert.equal(new Set(record[9]).size,
      PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS.length,
    "each reviewed origin has one distinct proof fingerprint per vector");
    assert.ok(record[9].every((fingerprint) => /^[0-9a-f]{64}$/.test(fingerprint)));
    for (const vector of PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS) {
      assert.ok(probedTargets.has(
        `${reviewed[2]}\n${vector.probeMethod}\n${vector.probePath}`,
      ), `reviewed origin ${reviewed[0]} was probed for ${vector.probeMethod} ${
        vector.probePath}`);
    }
    assert.deepEqual(record[7], [
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
      "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
    ]);
  }
  const nullShaSource = productionLegacyDeploymentInventory().records.find((record) =>
    record.sha === null);
  const nullShaProof = proof.probeRecords.find((record) =>
    record[0] === nullShaSource.origin);
  assert.equal(nullShaProof[3], null, "missing provenance SHA must never use candidate SHA");
  const nonReadySource = productionLegacyDeploymentInventory().records.find((record) =>
    record.deploymentStatus !== "READY");
  assert.ok(proof.probeRecords.some((record) => record[0] === nonReadySource.origin),
    "ERROR/BLOCKED origins remain in exhaustive edge-WAF coverage");
});

test("one non-denied origin fails the entire quiesce proof closed", async () => {
  const normalized = normalize();
  let count = 0;
  await assert.rejects(() => probeProductionWriterQuiesceOrigins(normalized, {
    concurrency: 1,
    fetchImpl: async () => {
      count += 1;
      return new Response("response", {
        status: count === 7 ? 200 : 403,
        headers: count === 7 ? { server: "Vercel" } : {
          "x-vercel-mitigated": "deny",
          server: "Vercel",
          "x-vercel-id": `probe-${count}`,
        },
      });
    },
  }), (error) => error.code === "STEP11_6_WRITER_QUIESCE_PROBE_NOT_EDGE_DENIED");
});
