import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildProviderQuiesceStagePayload,
  buildRetainedProviderAttestationChallengePayload,
  canAbandonRetainedProviderAttestationChallenge,
  canExecuteProviderQuiesceStage,
  discardAbandonedProviderAttestationAttempt,
  ensureProviderAttestationStageState,
  validateLoadedProviderAttestationEnvelope,
  validateProviderAttestationChallenge,
  validateProviderAttestationRequest,
} from "../lib/production-google-writer-fence-attestation-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ids = Array.from({ length: 16 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const nextId = (values = ids) => {
  let index = 0;
  return () => values[index++];
};

function challenge(state, stage, status = "ISSUED") {
  const prefix = stage === "BEGIN" ? "begin" : "finalize";
  return {
    found: true,
    challengeId: stage === "BEGIN" ? ids[8] : ids[9],
    challengeRequestId: state[`${prefix}ChallengeRequestId`],
    operationRequestId: state[`${prefix}OperationRequestId`],
    evidenceRequestId: state.evidenceRequestId,
    challengeRequestFingerprint: "a".repeat(64),
    stage,
    purpose: "REHEARSAL",
    status,
    vercelProjectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    vercelTeamId: "team_12345678",
    candidateDeploymentId: "dpl_Candidate1234",
    candidateDeploymentCommit: "b".repeat(40),
    candidateDeploymentTarget: "PREVIEW",
    candidateAliasOrigin: "https://candidate.example.vercel.app",
    candidateImmutableOrigin: "https://immutable.example.vercel.app",
    routingRuleId: "rule.writer-fence",
    routingRuleConfigVersion: "revision-1",
    consumedAttestationId: status === "CONSUMED" ? ids[10] : "",
    consumedAttestationFingerprint: status === "CONSUMED" ? "c".repeat(64) : "",
    consumeRequestId: status === "CONSUMED"
      ? state[`${prefix}ConsumeRequestId`] : "",
    issuedAt: "2026-08-26T19:00:00.000Z",
    expiresAt: "2026-08-26T19:02:00.000Z",
  };
}

function requestFor(value) {
  return {
    schemaVersion: "bagger-vercel-provider-attestation-request-v1",
    challengeId: value.challengeId,
    challengeRequestFingerprint: value.challengeRequestFingerprint,
    requestId: value.operationRequestId,
    stage: value.stage,
    purpose: value.purpose,
    projectId: value.vercelProjectId,
    teamId: value.vercelTeamId,
    candidateDeploymentId: value.candidateDeploymentId,
    candidateCommitSha: value.candidateDeploymentCommit,
    candidateDeploymentTarget: value.candidateDeploymentTarget,
    candidateAliasOrigin: value.candidateAliasOrigin,
    candidateImmutableOrigin: value.candidateImmutableOrigin,
    routingRuleId: value.routingRuleId,
    routingRuleConfigVersion: value.routingRuleConfigVersion,
  };
}

function envelopeFor(value) {
  return {
    schemaVersion: "bagger-vercel-provider-attestation-envelope-v1",
    algorithm: "Ed25519",
    signerKeyVersion: "STEP11_6_VERCEL_ATTESTER_V1",
    signerKeyFingerprint: "d".repeat(64),
    attestationFingerprint: "e".repeat(64),
    signature: "signed_provider_attestation",
    attestation: {
      attestationId: ids[11],
      challengeId: value.challengeId,
      challengeRequestFingerprint: value.challengeRequestFingerprint,
      requestId: value.operationRequestId,
      stage: value.stage,
      purpose: value.purpose,
      vercelProjectId: value.vercelProjectId,
      vercelTeamId: value.vercelTeamId,
      candidateDeploymentId: value.candidateDeploymentId,
      candidateDeploymentCommit: value.candidateDeploymentCommit,
      candidateDeploymentTarget: value.candidateDeploymentTarget,
      routingRuleId: value.routingRuleId,
      routingRuleConfigVersion: value.routingRuleConfigVersion,
    },
  };
}

test("BEGIN and FINALIZE keep one evidence identity and distinct durable action identities", () => {
  const createId = nextId();
  const begin = ensureProviderAttestationStageState({}, "BEGIN", createId);
  const finalize = ensureProviderAttestationStageState(begin, "FINALIZE", createId);
  const values = [
    finalize.evidenceRequestId,
    finalize.beginOperationRequestId,
    finalize.beginChallengeRequestId,
    finalize.beginConsumeRequestId,
    finalize.finalizeOperationRequestId,
    finalize.finalizeChallengeRequestId,
    finalize.finalizeConsumeRequestId,
  ];
  assert.equal(new Set(values).size, values.length);
  assert.equal(finalize.evidenceRequestId, begin.evidenceRequestId);
  assert.deepEqual(
    ensureProviderAttestationStageState(finalize, "FINALIZE", nextId(ids.slice(12))),
    finalize,
  );
});

test("an unsigned fresh BEGIN or FINALIZE cannot be built as executable", () => {
  const createId = nextId();
  let state = ensureProviderAttestationStageState({}, "BEGIN", createId);
  state = { ...state, beginProviderChallenge: validateProviderAttestationChallenge(
    challenge(state, "BEGIN"), state, "BEGIN", "REHEARSAL",
  ) };
  assert.equal(canExecuteProviderQuiesceStage(state, "BEGIN"), false);
  assert.throws(() => buildProviderQuiesceStagePayload(state, "BEGIN", {
    purpose: "REHEARSAL", routingRule: {},
  }), /signed provider envelope or exact durable consumed reservation/i);

  state = ensureProviderAttestationStageState(state, "FINALIZE", createId);
  state = { ...state, finalizeProviderChallenge: validateProviderAttestationChallenge(
    challenge(state, "FINALIZE"), state, "FINALIZE", "REHEARSAL",
  ) };
  assert.equal(canExecuteProviderQuiesceStage(state, "FINALIZE"), false);
  assert.throws(() => buildProviderQuiesceStagePayload(state, "FINALIZE", {
    purpose: "REHEARSAL", routingRule: {}, quiesceEvidenceId: ids[15],
  }), /signed provider envelope or exact durable consumed reservation/i);
});

test("download request and loaded Keychain envelope must bind the exact DB challenge", () => {
  const state = ensureProviderAttestationStageState({}, "BEGIN", nextId());
  const issued = validateProviderAttestationChallenge(
    challenge(state, "BEGIN"), state, "BEGIN", "REHEARSAL",
  );
  assert.equal(validateProviderAttestationRequest(
    requestFor(issued), issued,
  ).challengeId, issued.challengeId);
  const envelope = validateLoadedProviderAttestationEnvelope(
    envelopeFor(issued), issued,
  );
  const ready = {
    ...state,
    beginProviderChallenge: issued,
    beginSignedProviderAttestation: envelope,
  };
  const payload = buildProviderQuiesceStagePayload(ready, "BEGIN", {
    purpose: "REHEARSAL", routingRule: { ruleId: "rule.writer-fence" },
  });
  assert.equal(payload.providerChallengeId, issued.challengeId);
  assert.equal(payload.challengeRequestId, state.beginChallengeRequestId);
  assert.equal(payload.providerAttestationConsumeRequestId, state.beginConsumeRequestId);
  assert.equal(payload.providerAttestation, envelope);
  assert.throws(() => validateLoadedProviderAttestationEnvelope({
    ...envelope,
    attestation: { ...envelope.attestation, requestId: ids[14] },
  }, issued), /did not match the database challenge/i);
});

test("only an exact durable CONSUMED reservation permits envelope-free lost-response recovery", () => {
  const state = ensureProviderAttestationStageState({}, "BEGIN", nextId());
  const consumed = validateProviderAttestationChallenge(
    challenge(state, "BEGIN", "CONSUMED"), state, "BEGIN", "REHEARSAL",
  );
  const recovered = { ...state, beginProviderChallenge: consumed };
  assert.equal(canExecuteProviderQuiesceStage(recovered, "BEGIN"), true);
  const payload = buildProviderQuiesceStagePayload(recovered, "BEGIN", {
    purpose: "REHEARSAL", routingRule: {},
  });
  assert.equal("providerAttestation" in payload, false);
  assert.equal(payload.providerAttestationConsumeRequestId, state.beginConsumeRequestId);
  assert.throws(() => validateProviderAttestationChallenge({
    ...consumed, consumeRequestId: ids[14],
  }, state, "BEGIN", "REHEARSAL"), /did not match this stage/i);
});

test("only an exact authoritative ABANDONED receipt clears retained BEGIN recovery", () => {
  const initial = ensureProviderAttestationStageState({}, "BEGIN", nextId());
  const issued = validateProviderAttestationChallenge(
    challenge(initial, "BEGIN"), initial, "BEGIN", "REHEARSAL",
  );
  const retained = {
    ...initial,
    baseline: "a".repeat(64),
    canonicalValues: "b".repeat(64),
    routingRuleId: issued.routingRuleId,
    routingRuleRevision: issued.routingRuleConfigVersion,
    beginAbandonRequestId: ids[12],
    beginProviderChallenge: issued,
    beginProviderAttestationRequest: requestFor(issued),
    beginSignedProviderAttestation: envelopeFor(issued),
  };
  const eligible = {
    ...issued,
    abandonEligible: true,
    abandonmentCode: "ELIGIBLE",
    serverObservedAt: "2026-08-26T19:02:31.000Z",
  };
  assert.equal(canAbandonRetainedProviderAttestationChallenge(
    retained, eligible, "REHEARSAL",
  ), true);
  const retainedPayload = buildRetainedProviderAttestationChallengePayload(
    retained, "REHEARSAL",
  );
  assert.deepEqual(retainedPayload, {
    quiescePurpose: "REHEARSAL",
    evidenceRequestId: retained.evidenceRequestId,
    challengeRequestId: retained.beginChallengeRequestId,
    providerAttestationStage: "BEGIN",
    providerChallengeId: issued.challengeId,
    providerRetainedChallenge: issued,
  });
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained, eligible, "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");

  const abandoned = {
    ...issued,
    status: "ABANDONED",
    abandonEligible: false,
    abandonmentCode: "ABANDONED",
    abandonRequestId: retained.beginAbandonRequestId,
    abandonRequestFingerprint: "f".repeat(64),
    abandonedAt: "2026-08-26T19:03:00.000Z",
    serverObservedAt: "2026-08-26T19:03:01.000Z",
  };
  assert.equal(canAbandonRetainedProviderAttestationChallenge(
    retained, abandoned, "REHEARSAL",
  ), true, "a lost abandonment response must remain retryable with the same ID");
  const cleared = discardAbandonedProviderAttestationAttempt(
    retained, abandoned, "REHEARSAL",
  );
  assert.deepEqual(cleared, {
    baseline: "a".repeat(64),
    canonicalValues: "b".repeat(64),
  });
  for (const key of [
    "routingRuleId", "routingRuleRevision", "evidenceRequestId",
    "beginOperationRequestId", "beginChallengeRequestId", "beginConsumeRequestId",
    "beginAbandonRequestId", "beginProviderChallenge",
    "beginProviderAttestationRequest", "beginSignedProviderAttestation",
    "retainedProviderChallengeInspection",
  ]) assert.equal(Object.hasOwn(cleared, key), false, `${key} must be cleared`);

  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, abandonRequestId: ids[13] },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, abandonedAt: "" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, abandonRequestFingerprint: "" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, abandonRequestFingerprint: "not-a-fingerprint" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, serverObservedAt: "" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, serverObservedAt: "not-a-timestamp" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, expiresAt: "" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_CHALLENGE_INVALID");
  assert.throws(() => discardAbandonedProviderAttestationAttempt(
    retained,
    { ...abandoned, routingRuleConfigVersion: "revision-mismatch" },
    "REHEARSAL",
  ), (error) => error.code === "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
});

test("consumed, unexpired/ineligible, mismatched, and durable retained attempts reject abandonment", () => {
  const initial = ensureProviderAttestationStageState({}, "BEGIN", nextId());
  const issued = validateProviderAttestationChallenge(
    challenge(initial, "BEGIN"), initial, "BEGIN", "REHEARSAL",
  );
  const retained = {
    ...initial,
    beginAbandonRequestId: ids[12],
    beginProviderChallenge: issued,
    beginProviderAttestationRequest: requestFor(issued),
    beginSignedProviderAttestation: envelopeFor(issued),
  };
  const eligible = {
    ...issued,
    abandonEligible: true,
    abandonmentCode: "ELIGIBLE",
    serverObservedAt: "2026-08-26T19:02:31.000Z",
  };
  const unexpired = {
    ...issued,
    abandonEligible: false,
    abandonmentCode: "NOT_EXPIRED",
    serverObservedAt: "2026-08-26T19:01:59.000Z",
  };
  const consumed = {
    ...challenge(initial, "BEGIN", "CONSUMED"),
    abandonEligible: false,
    abandonmentCode: "CONSUMED",
    serverObservedAt: "2026-08-26T19:02:31.000Z",
  };
  assert.equal(canAbandonRetainedProviderAttestationChallenge(
    retained, unexpired, "REHEARSAL",
  ), false);
  assert.equal(canAbandonRetainedProviderAttestationChallenge(
    retained, consumed, "REHEARSAL",
  ), false);
  assert.equal(canAbandonRetainedProviderAttestationChallenge(
    retained,
    { ...eligible, challengeId: ids[14] },
    "REHEARSAL",
  ), false);

  const durableStates = [
    ["quiesceEvidenceId", ids[15]],
    ["quiesceStatus", "DRAINING"],
    ["drainStartedAt", "2026-08-26T19:03:00.000Z"],
    ["quiesceExpiresAt", "2026-08-26T19:30:00.000Z"],
    ["rehearsalRequestId", ids[15]],
    ["rehearsalRunId", ids[15]],
    ["restoreRequestId", ids[15]],
    ["rehearsalCertified", true],
    ["finalizeOperationRequestId", ids[15]],
    ["fenceId", ids[15]],
  ];
  for (const [key, value] of durableStates) {
    const unsafe = { ...retained, [key]: value };
    assert.equal(canAbandonRetainedProviderAttestationChallenge(
      unsafe, eligible, "REHEARSAL",
    ), false);
    assert.throws(() => discardAbandonedProviderAttestationAttempt(
      unsafe,
      {
        ...issued,
        status: "ABANDONED",
        abandonmentCode: "ABANDONED",
        abandonRequestId: ids[12],
        abandonRequestFingerprint: "f".repeat(64),
        abandonedAt: "2026-08-26T19:03:00.000Z",
        serverObservedAt: "2026-08-26T19:03:01.000Z",
      },
      "REHEARSAL",
    ), (error) => error.code === "PROVIDER_ATTESTATION_RETAINED_ATTEMPT_UNSAFE");
  }
});

test("both browser clients gate quiesce execution on the attestation workflow", async () => {
  const [rehearsal, persistent, route, receiptAdapter] = await Promise.all([
    readFile(path.join(root,
      "app/admin/step11-6-production-google-writer-fence/WriterFenceClient.js"), "utf8"),
    readFile(path.join(root,
      "app/admin/step12-production-google-writer-provider-fence/PersistentWriterFenceClient.js"), "utf8"),
    readFile(path.join(root,
      "app/api/admin/step11-6-production-google-writer-fence/route.js"), "utf8"),
    readFile(path.join(root,
      "lib/production-google-writer-fence-receipt-server.js"), "utf8"),
  ]);
  for (const source of [rehearsal, persistent]) {
    assert.match(source, /issue-provider-attestation-challenge/);
    assert.match(source, /Download BEGIN attester request/);
    assert.match(source, /Load signed FINALIZE envelope/);
    assert.match(source, /buildProviderQuiesceStagePayload/);
    assert.match(source, /disabled=\{Boolean\(busy\)[\s\S]{0,120}!beginExecutable/);
    assert.match(source, /disabled=\{Boolean\(busy\)[\s\S]{0,160}!finalizeExecutable/);
  }
  assert.match(rehearsal, /Safe diagnostics/);
  assert.match(rehearsal, /JSON\.stringify\(error\.diagnostics, null, 2\)/);
  assert.match(rehearsal, /inspect-retained-provider-attestation-challenge/);
  assert.match(rehearsal, /abandon-provider-attestation-challenge/);
  assert.match(rehearsal, /canAbandonRetainedProviderAttestationChallenge/);
  assert.match(rehearsal, /discardAbandonedProviderAttestationAttempt/);
  assert.doesNotMatch(rehearsal,
    /canDiscardExpiredProviderAttestationAttempt|discardExpiredProviderAttestationAttempt/);
  assert.ok(rehearsal.indexOf("inspect-retained-provider-attestation-challenge") <
    rehearsal.indexOf("abandon-provider-attestation-challenge"));
  assert.match(rehearsal, /setOwnerFreezeConfirmed\(false\)/);
  assert.match(rehearsal, /setRoutingRuleId\(""\)/);
  assert.match(rehearsal, /setRoutingRuleRevision\(""\)/);
  assert.doesNotMatch(rehearsal,
    /localStorage(?:\?\.|\.)(?:clear|removeItem)\s*\(/);
  assert.doesNotMatch(rehearsal,
    /inspect_production_vercel_provider_(?:attestation_challenge_abandonment|challenge_abandonment)|abandon_production_vercel_provider_attestation_challenge/,
  "the browser must use the same-origin server route, never the service-role RPC directly");
  const abandonFunction = rehearsal.slice(
    rehearsal.indexOf("async function abandonRetainedChallenge"),
    rehearsal.indexOf("async function issueChallenge"),
  );
  assert.match(abandonFunction,
    /const beginAbandonRequestId = recovery\.beginAbandonRequestId \|\| requestId\(\)/);
  assert.ok(abandonFunction.indexOf("storeExact(stable)") <
    abandonFunction.indexOf('"abandon-provider-attestation-challenge"'),
  "the stable abandonment identity must be retained before the request");
  assert.ok(abandonFunction.indexOf('"abandon-provider-attestation-challenge"') <
    abandonFunction.indexOf("discardAbandonedProviderAttestationAttempt("),
  "recovery can clear only after the authoritative abandonment response");

  for (const action of [
    "inspect-retained-provider-attestation-challenge",
    "abandon-provider-attestation-challenge",
  ]) assert.match(route, new RegExp(`"${action}"`));
  assert.match(route, /dependencies\.quiesce\.inspectRetainedChallenge/);
  assert.match(route, /dependencies\.quiesce\.abandonChallenge/);
  assert.match(route, /providerRetainedChallenge/);
  assert.match(route, /abandonRequestId/);
  assert.match(route, /abandonRequestFingerprint/);
  assert.match(route, /serverObservedAt/);
  assert.match(receiptAdapter, /^import "server-only";/);
  assert.match(receiptAdapter, /PRODUCTION_SUPABASE_SECRET_KEY/);
  assert.match(receiptAdapter, /function retainedChallengeScope\(input\)/);
  for (const retainedField of [
    "challengeId", "challengeRequestId", "operationRequestId", "evidenceRequestId",
    "candidateDeploymentId", "candidateDeploymentCommit",
    "candidateDeploymentTarget", "candidateAliasOrigin", "candidateImmutableOrigin",
    "routingRuleId", "routingRuleConfigVersion",
  ]) assert.match(receiptAdapter, new RegExp(`challenge\\.${retainedField}`));
  const allowlist = receiptAdapter.match(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(allowlist, "the server RPC allowlist must be statically extractable");
  const allowedRpcs = [...allowlist[1].matchAll(/"([a-z0-9_]+)"/g)]
    .map((match) => match[1]);
  assert.equal(allowedRpcs.length, 18);
  assert.equal(new Set(allowedRpcs).size, allowedRpcs.length);
  for (const rpc of allowedRpcs) {
    assert.ok(rpc.length <= 63,
      `PostgREST RPC ${rpc} must survive PostgreSQL identifier storage exactly`);
    assert.match(receiptAdapter, new RegExp(`"${rpc}"`));
  }
  assert.ok(allowedRpcs.includes(
    "inspect_production_vercel_provider_challenge_abandonment"));
  assert.ok(allowedRpcs.includes(
    "abandon_production_vercel_provider_attestation_challenge"));
  assert.doesNotMatch(receiptAdapter,
    /"inspect_production_vercel_provider_attestation_challenge_abandonment"/,
    "the obsolete overlength PostgREST RPC name must not return");
  assert.match(receiptAdapter, /inspectRetainedChallenge/);
  assert.match(receiptAdapter, /abandonChallenge/);
  assert.match(receiptAdapter, /EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED/);
});
