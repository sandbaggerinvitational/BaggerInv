import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildProviderQuiesceStagePayload,
  canExecuteProviderQuiesceStage,
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

test("both browser clients gate quiesce execution on the attestation workflow", async () => {
  const rehearsal = await readFile(path.join(root,
    "app/admin/step11-6-production-google-writer-fence/WriterFenceClient.js"), "utf8");
  const persistent = await readFile(path.join(root,
    "app/admin/step12-production-google-writer-provider-fence/PersistentWriterFenceClient.js"), "utf8");
  for (const source of [rehearsal, persistent]) {
    assert.match(source, /issue-provider-attestation-challenge/);
    assert.match(source, /Download BEGIN attester request/);
    assert.match(source, /Load signed FINALIZE envelope/);
    assert.match(source, /buildProviderQuiesceStagePayload/);
    assert.match(source, /disabled=\{Boolean\(busy\)[\s\S]{0,120}!beginExecutable/);
    assert.match(source, /disabled=\{Boolean\(busy\)[\s\S]{0,160}!finalizeExecutable/);
  }
});
