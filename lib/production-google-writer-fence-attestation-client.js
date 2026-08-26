const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;

export const PROVIDER_ATTESTATION_REQUEST_SCHEMA =
  "bagger-vercel-provider-attestation-request-v1";
export const PROVIDER_ATTESTATION_ENVELOPE_SCHEMA =
  "bagger-vercel-provider-attestation-envelope-v1";
export const PROVIDER_ATTESTATION_ALGORITHM = "Ed25519";
export const PROVIDER_ATTESTATION_SIGNER_VERSION =
  "STEP11_6_VERCEL_ATTESTER_V1";

const clean = (value) => String(value ?? "").trim();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function stageContract(stageInput) {
  const stage = clean(stageInput).toUpperCase();
  if (stage === "BEGIN") return Object.freeze({
    stage,
    prefix: "begin",
    operationKey: "beginOperationRequestId",
    challengeRequestKey: "beginChallengeRequestId",
    consumeRequestKey: "beginConsumeRequestId",
    challengeKey: "beginProviderChallenge",
    attesterRequestKey: "beginProviderAttestationRequest",
    envelopeKey: "beginSignedProviderAttestation",
  });
  if (stage === "FINALIZE") return Object.freeze({
    stage,
    prefix: "finalize",
    operationKey: "finalizeOperationRequestId",
    challengeRequestKey: "finalizeChallengeRequestId",
    consumeRequestKey: "finalizeConsumeRequestId",
    challengeKey: "finalizeProviderChallenge",
    attesterRequestKey: "finalizeProviderAttestationRequest",
    envelopeKey: "finalizeSignedProviderAttestation",
  });
  fail(
    "PROVIDER_ATTESTATION_STAGE_INVALID",
    "The provider-attestation stage was invalid.",
  );
}

function exactUuid(value, code) {
  const selected = clean(value).toLowerCase();
  if (!UUID.test(selected)) fail(code, "A stable request identity was invalid.");
  return selected;
}

function distinctRequestId(createRequestId, used) {
  if (typeof createRequestId !== "function") {
    fail("PROVIDER_ATTESTATION_REQUEST_ID_FACTORY_INVALID",
      "A secure request identity factory was unavailable.");
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const value = exactUuid(createRequestId(),
      "PROVIDER_ATTESTATION_REQUEST_ID_INVALID");
    if (!used.has(value)) {
      used.add(value);
      return value;
    }
  }
  fail("PROVIDER_ATTESTATION_REQUEST_ID_COLLISION",
    "Distinct provider-attestation request identities could not be created.");
}

function existingIds(state) {
  const values = [
    "evidenceRequestId",
    "beginOperationRequestId", "beginChallengeRequestId", "beginConsumeRequestId",
    "finalizeOperationRequestId", "finalizeChallengeRequestId",
    "finalizeConsumeRequestId",
  ].map((key) => clean(state?.[key]).toLowerCase()).filter(Boolean);
  if (new Set(values).size !== values.length) {
    fail("PROVIDER_ATTESTATION_REQUEST_ID_COLLISION",
      "Retained provider-attestation request identities were not distinct.");
  }
  return new Set(values);
}

export function ensureProviderAttestationStageState(
  recoveryInput,
  stageInput,
  createRequestId,
) {
  const contract = stageContract(stageInput);
  const state = { ...(recoveryInput || {}) };
  const used = existingIds(state);
  if (!state.evidenceRequestId) {
    if (contract.stage !== "BEGIN") {
      fail("PROVIDER_ATTESTATION_EVIDENCE_REQUEST_REQUIRED",
        "The shared BEGIN evidence request identity is required before FINALIZE.");
    }
    state.evidenceRequestId = distinctRequestId(createRequestId, used);
  } else {
    state.evidenceRequestId = exactUuid(
      state.evidenceRequestId,
      "PROVIDER_ATTESTATION_EVIDENCE_REQUEST_INVALID",
    );
  }
  for (const key of [
    contract.operationKey,
    contract.challengeRequestKey,
    contract.consumeRequestKey,
  ]) {
    if (state[key]) {
      state[key] = exactUuid(state[key], "PROVIDER_ATTESTATION_REQUEST_ID_INVALID");
    } else {
      state[key] = distinctRequestId(createRequestId, used);
    }
  }
  const ids = [
    state.evidenceRequestId,
    state[contract.operationKey],
    state[contract.challengeRequestKey],
    state[contract.consumeRequestKey],
  ];
  if (new Set(ids).size !== ids.length) {
    fail("PROVIDER_ATTESTATION_REQUEST_ID_COLLISION",
      "Provider-attestation request identities must be distinct.");
  }
  return Object.freeze(state);
}

export function validateProviderAttestationChallenge(
  challengeInput,
  state,
  stageInput,
  purposeInput,
) {
  const contract = stageContract(stageInput);
  const challenge = challengeInput || {};
  const purpose = clean(purposeInput).toUpperCase();
  const status = clean(challenge.status).toUpperCase();
  if (challenge.found === false || !new Set(["ISSUED", "CONSUMED"]).has(status) ||
      exactUuid(challenge.challengeRequestId,
        "PROVIDER_ATTESTATION_CHALLENGE_INVALID") !==
        exactUuid(state[contract.challengeRequestKey],
          "PROVIDER_ATTESTATION_CHALLENGE_INVALID") ||
      exactUuid(challenge.operationRequestId,
        "PROVIDER_ATTESTATION_CHALLENGE_INVALID") !==
        exactUuid(state[contract.operationKey],
          "PROVIDER_ATTESTATION_CHALLENGE_INVALID") ||
      exactUuid(challenge.evidenceRequestId,
        "PROVIDER_ATTESTATION_CHALLENGE_INVALID") !==
        exactUuid(state.evidenceRequestId,
          "PROVIDER_ATTESTATION_CHALLENGE_INVALID") ||
      clean(challenge.stage).toUpperCase() !== contract.stage ||
      clean(challenge.purpose).toUpperCase() !== purpose ||
      !UUID.test(clean(challenge.challengeId)) ||
      !HEX64.test(clean(challenge.challengeRequestFingerprint).toLowerCase()) ||
      !DEPLOYMENT_ID.test(clean(challenge.candidateDeploymentId)) ||
      !HEX40.test(clean(challenge.candidateDeploymentCommit).toLowerCase()) ||
      !new Set(["PREVIEW", "PRODUCTION"]).has(
        clean(challenge.candidateDeploymentTarget).toUpperCase(),
      ) || (status === "CONSUMED" && (
        exactUuid(challenge.consumeRequestId,
          "PROVIDER_ATTESTATION_CHALLENGE_INVALID") !==
          exactUuid(state[contract.consumeRequestKey],
            "PROVIDER_ATTESTATION_CHALLENGE_INVALID") ||
        !UUID.test(clean(challenge.consumedAttestationId)) ||
        !HEX64.test(clean(challenge.consumedAttestationFingerprint).toLowerCase())
      ))) {
    fail("PROVIDER_ATTESTATION_CHALLENGE_INVALID",
      "The database-issued provider challenge did not match this stage.");
  }
  return Object.freeze({ ...challenge, status });
}

export function validateProviderAttestationRequest(
  requestInput,
  challenge,
) {
  const request = requestInput || {};
  if (request.schemaVersion !== PROVIDER_ATTESTATION_REQUEST_SCHEMA ||
      clean(request.challengeId).toLowerCase() !==
        clean(challenge.challengeId).toLowerCase() ||
      clean(request.challengeRequestFingerprint).toLowerCase() !==
        clean(challenge.challengeRequestFingerprint).toLowerCase() ||
      clean(request.requestId).toLowerCase() !==
        clean(challenge.operationRequestId).toLowerCase() ||
      clean(request.stage).toUpperCase() !== clean(challenge.stage).toUpperCase() ||
      clean(request.purpose).toUpperCase() !== clean(challenge.purpose).toUpperCase() ||
      clean(request.candidateDeploymentId) !== challenge.candidateDeploymentId ||
      clean(request.candidateCommitSha).toLowerCase() !==
        clean(challenge.candidateDeploymentCommit).toLowerCase() ||
      clean(request.candidateDeploymentTarget).toUpperCase() !==
        clean(challenge.candidateDeploymentTarget).toUpperCase()) {
    fail("PROVIDER_ATTESTATION_REQUEST_INVALID",
      "The downloadable attester request did not match the database challenge.");
  }
  return Object.freeze({ ...request });
}

export function validateLoadedProviderAttestationEnvelope(
  envelopeInput,
  challenge,
) {
  const envelope = envelopeInput || {};
  const claim = envelope.attestation || {};
  if (envelope.schemaVersion !== PROVIDER_ATTESTATION_ENVELOPE_SCHEMA ||
      envelope.algorithm !== PROVIDER_ATTESTATION_ALGORITHM ||
      envelope.signerKeyVersion !== PROVIDER_ATTESTATION_SIGNER_VERSION ||
      !HEX64.test(clean(envelope.signerKeyFingerprint).toLowerCase()) ||
      !HEX64.test(clean(envelope.attestationFingerprint).toLowerCase()) ||
      !BASE64URL.test(clean(envelope.signature)) ||
      !UUID.test(clean(claim.attestationId)) ||
      clean(claim.attestationId).toLowerCase() ===
        clean(challenge.challengeId).toLowerCase() ||
      clean(claim.challengeId).toLowerCase() !==
        clean(challenge.challengeId).toLowerCase() ||
      clean(claim.challengeRequestFingerprint).toLowerCase() !==
        clean(challenge.challengeRequestFingerprint).toLowerCase() ||
      clean(claim.requestId).toLowerCase() !==
        clean(challenge.operationRequestId).toLowerCase() ||
      clean(claim.stage).toUpperCase() !== clean(challenge.stage).toUpperCase() ||
      clean(claim.purpose).toUpperCase() !== clean(challenge.purpose).toUpperCase() ||
      clean(claim.vercelProjectId) !== clean(challenge.vercelProjectId) ||
      clean(claim.vercelTeamId) !== clean(challenge.vercelTeamId) ||
      clean(claim.candidateDeploymentId) !== clean(challenge.candidateDeploymentId) ||
      clean(claim.candidateDeploymentCommit).toLowerCase() !==
        clean(challenge.candidateDeploymentCommit).toLowerCase() ||
      clean(claim.candidateDeploymentTarget).toUpperCase() !==
        clean(challenge.candidateDeploymentTarget).toUpperCase() ||
      clean(claim.routingRuleId) !== clean(challenge.routingRuleId) ||
      clean(claim.routingRuleConfigVersion) !==
        clean(challenge.routingRuleConfigVersion)) {
    fail("PROVIDER_ATTESTATION_ENVELOPE_BINDING_INVALID",
      "The loaded signed envelope did not match the database challenge.");
  }
  // Signature verification and provider-evidence validation are intentionally
  // server-only. The browser merely refuses obviously unbound files.
  return Object.freeze({ ...envelope });
}

export function canExecuteProviderQuiesceStage(state, stageInput) {
  const contract = stageContract(stageInput);
  const challenge = state?.[contract.challengeKey];
  if (!challenge || !new Set(["ISSUED", "CONSUMED"]).has(
    clean(challenge.status).toUpperCase(),
  )) return false;
  if (state?.[contract.envelopeKey]) return true;
  return clean(challenge.status).toUpperCase() === "CONSUMED" &&
    UUID.test(clean(challenge.consumedAttestationId)) &&
    HEX64.test(clean(challenge.consumedAttestationFingerprint).toLowerCase());
}

export function buildProviderQuiesceStagePayload(
  state,
  stageInput,
  { purpose, routingRule, priorEvidenceId = "", quiesceEvidenceId = "" } = {},
) {
  const contract = stageContract(stageInput);
  const challenge = validateProviderAttestationChallenge(
    state?.[contract.challengeKey], state, contract.stage, purpose,
  );
  if (!canExecuteProviderQuiesceStage(state, contract.stage)) {
    fail("PROVIDER_ATTESTATION_REQUIRED",
      "A signed provider envelope or exact durable consumed reservation is required.");
  }
  const envelope = state?.[contract.envelopeKey] || null;
  if (envelope) validateLoadedProviderAttestationEnvelope(envelope, challenge);
  return Object.freeze({
    quiescePurpose: clean(purpose).toUpperCase(),
    evidenceRequestId: state.evidenceRequestId,
    priorEvidenceId: clean(priorEvidenceId),
    quiesceEvidenceId: clean(quiesceEvidenceId),
    routingRule,
    challengeRequestId: state[contract.challengeRequestKey],
    providerAttestationStage: contract.stage,
    providerChallengeId: challenge.challengeId,
    providerAttestationConsumeRequestId: state[contract.consumeRequestKey],
    ...(envelope ? { providerAttestation: envelope } : {}),
  });
}

export function providerAttestationStageKeys(stageInput) {
  return stageContract(stageInput);
}
