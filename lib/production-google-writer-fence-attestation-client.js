const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;

export const PROVIDER_ATTESTATION_REQUEST_SCHEMA =
  "bagger-vercel-provider-attestation-request-v1";
export const PROVIDER_ATTESTATION_ENVELOPE_SCHEMA =
  "bagger-vercel-provider-attestation-envelope-v2";
export const PROVIDER_ATTESTATION_CLAIM_SCHEMA =
  "bagger-vercel-provider-attestation-noncanonical-host-v2";
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
    abandonRequestKey: "beginAbandonRequestId",
    abandonmentInspectionKey: "beginProviderChallengeAbandonmentInspection",
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
    abandonRequestKey: "finalizeAbandonRequestId",
    abandonmentInspectionKey: "finalizeProviderChallengeAbandonmentInspection",
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

const RETAINED_ATTEMPT_KEYS = new Set([
  "baseline",
  "canonicalValues",
  "routingRuleId",
  "routingRuleRevision",
  "evidenceRequestId",
  "beginOperationRequestId",
  "beginChallengeRequestId",
  "beginConsumeRequestId",
  "beginProviderChallenge",
  "beginProviderAttestationRequest",
  "beginSignedProviderAttestation",
  "beginAbandonRequestId",
  "beginProviderChallengeAbandonmentInspection",
  "retainedProviderChallengeInspection",
  "finalizeOperationRequestId",
  "finalizeChallengeRequestId",
  "finalizeConsumeRequestId",
  "finalizeProviderChallenge",
  "finalizeProviderAttestationRequest",
  "finalizeSignedProviderAttestation",
  "finalizeAbandonRequestId",
  "finalizeProviderChallengeAbandonmentInspection",
  "quiesceEvidenceId",
  "quiesceStatus",
  "drainStartedAt",
  "quiesceExpiresAt",
  "rehearsalRequestId",
  "rehearsalRunId",
  "rehearsalCertified",
  "restoreRequestId",
  "quiesceRefreshPending",
  "priorEvidenceIdForCycle",
  "fenceId",
  "installRequestId",
  "currentVerificationId",
  "fenceStatus",
  "refreshRequestId",
  "removalRequestId",
]);

function exactRetainedAttemptState(recoveryInput, stageInput) {
  const contract = stageContract(stageInput);
  const state = recoveryInput && typeof recoveryInput === "object" &&
    !Array.isArray(recoveryInput) ? recoveryInput : null;
  if (!state || Object.keys(state).some(
    (key) => !RETAINED_ATTEMPT_KEYS.has(key),
  )) {
    fail(
      "PROVIDER_ATTESTATION_RETAINED_ATTEMPT_UNSAFE",
      `The retained ${contract.stage} attempt included unknown recovery state.`,
    );
  }
  if (contract.stage === "BEGIN") {
    const status = clean(state.quiesceStatus).toUpperCase();
    const speculative = new Set(["", "PROBING", "REFRESH_PENDING"]);
    const finalizeStatePresent = [
      "finalizeOperationRequestId", "finalizeChallengeRequestId",
      "finalizeConsumeRequestId", "finalizeProviderChallenge",
      "finalizeProviderAttestationRequest", "finalizeSignedProviderAttestation",
      "finalizeAbandonRequestId", "finalizeProviderChallengeAbandonmentInspection",
    ].some((key) => state[key] != null && state[key] !== "");
    if (clean(state.quiesceEvidenceId) && state.quiesceRefreshPending !== true ||
        !speculative.has(status) || clean(state.drainStartedAt) ||
        clean(state.quiesceExpiresAt) || clean(state.rehearsalRequestId) ||
        clean(state.rehearsalRunId) || clean(state.restoreRequestId) ||
        state.rehearsalCertified === true || finalizeStatePresent ||
        clean(state.fenceId) && state.quiesceRefreshPending !== true) {
      fail(
        "PROVIDER_ATTESTATION_RETAINED_ATTEMPT_UNSAFE",
        "The retained BEGIN attempt already had durable quiesce progression.",
      );
    }
  } else if (!clean(state.quiesceEvidenceId) ||
      clean(state.quiesceStatus).toUpperCase() !== "DRAINING") {
    fail(
      "PROVIDER_ATTESTATION_RETAINED_ATTEMPT_UNSAFE",
      "The retained FINALIZE attempt was not attached to a draining quiesce.",
    );
  }
  return state;
}

function sameRetainedChallenge(left, right) {
  const exactFields = [
    "vercelProjectId",
    "vercelTeamId",
    "candidateDeploymentId",
    "routingRuleId",
    "routingRuleConfigVersion",
  ];
  const lowercaseFields = [
    "challengeId",
    "challengeRequestId",
    "operationRequestId",
    "evidenceRequestId",
    "challengeRequestFingerprint",
    "candidateDeploymentCommit",
    "candidateAliasOrigin",
    "candidateImmutableOrigin",
  ];
  const uppercaseFields = ["stage", "purpose", "candidateDeploymentTarget"];
  return exactFields.every((key) => clean(left?.[key]) === clean(right?.[key])) &&
    lowercaseFields.every((key) => clean(left?.[key]).toLowerCase() ===
      clean(right?.[key]).toLowerCase()) &&
    uppercaseFields.every((key) => clean(left?.[key]).toUpperCase() ===
      clean(right?.[key]).toUpperCase());
}

export function canAbandonRetainedProviderAttestationChallenge(
  recoveryInput,
  inspectionInput,
  purposeInput,
  stageInput = "BEGIN",
) {
  try {
    const contract = stageContract(stageInput);
    const state = exactRetainedAttemptState(recoveryInput, contract.stage);
    const retained = validateRetainedProviderAttestationChallenge(
      state[contract.challengeKey], state, purposeInput, contract.stage,
    );
    const inspection = validateRetainedProviderAttestationChallenge(
      inspectionInput, state, purposeInput, contract.stage,
    );
    if (!new Set(["ISSUED", "CONSUMED"]).has(retained.status) ||
        !sameRetainedChallenge(retained, inspection)) return false;
    if (inspection.status === "ABANDONED") {
      discardAbandonedProviderAttestationAttempt(
        state, inspection, purposeInput, contract.stage,
      );
      return true;
    }
    const code = clean(inspection.abandonmentCode).toUpperCase();
    const eligibleCode = retained.status === "CONSUMED"
      ? code === "ELIGIBLE_CONSUMED_UNBOUND"
      : new Set(["ELIGIBLE", "ELIGIBLE_EXPIRED_UNCONSUMED"]).has(code);
    return inspection.status === retained.status &&
      inspection.abandonEligible === true && eligibleCode &&
      Number.isFinite(Date.parse(clean(inspection.serverObservedAt))) &&
      Date.parse(clean(inspection.serverObservedAt)) >
        Date.parse(clean(inspection.expiresAt));
  } catch {
    return false;
  }
}

export function discardAbandonedProviderAttestationAttempt(
  recoveryInput,
  receiptInput,
  purposeInput,
  stageInput = "BEGIN",
) {
  const contract = stageContract(stageInput);
  const state = exactRetainedAttemptState(recoveryInput, contract.stage);
  const retained = validateRetainedProviderAttestationChallenge(
    state[contract.challengeKey], state, purposeInput, contract.stage,
  );
  const receipt = validateRetainedProviderAttestationChallenge(
    receiptInput, state, purposeInput, contract.stage,
  );
  const retainedWasConsumed = retained.status === "CONSUMED";
  const consumed = receipt.consumedProviderAttestation || {};
  const expectedAbandonmentReason = retainedWasConsumed
    ? "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED"
    : contract.stage === "FINALIZE"
      ? "EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED"
      : "EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED";
  // Migration 036 could terminalize only an expired, unconsumed BEGIN and did
  // not yet persist an abandonment reason. Its immutable receipt remains a
  // valid lost-response result when every original binding below still
  // matches. No other reasonless terminal receipt is accepted.
  const historicalUnconsumedBegin = !retainedWasConsumed &&
    contract.stage === "BEGIN" && !clean(receipt.abandonmentReason);
  const consumedBindingValid = retainedWasConsumed
    ? receipt.consumeRequestId === retained.consumeRequestId &&
      receipt.consumedAttestationId === retained.consumedAttestationId &&
      receipt.consumedAttestationFingerprint ===
        retained.consumedAttestationFingerprint &&
      Number.isFinite(Date.parse(clean(receipt.consumedAt))) &&
      clean(consumed.status).toUpperCase() === "ABANDONED" &&
      clean(consumed.attestation_id || consumed.attestationId).toLowerCase() ===
        retained.consumedAttestationId &&
      clean(
        consumed.attestation_fingerprint || consumed.attestationFingerprint,
      ).toLowerCase() === retained.consumedAttestationFingerprint &&
      clean(consumed.challenge_id || consumed.challengeId).toLowerCase() ===
        retained.challengeId.toLowerCase() &&
      clean(
        consumed.operation_request_id || consumed.operationRequestId,
      ).toLowerCase() === retained.operationRequestId.toLowerCase() &&
      clean(
        consumed.evidence_request_id || consumed.evidenceRequestId,
      ).toLowerCase() === retained.evidenceRequestId.toLowerCase() &&
      clean(consumed.stage).toUpperCase() === contract.stage &&
      Number.isFinite(Date.parse(clean(
        consumed.binding_expires_at || consumed.bindingExpiresAt,
      ))) &&
      Number.isFinite(Date.parse(clean(
        consumed.abandoned_at || consumed.abandonedAt,
      ))) &&
      Date.parse(clean(consumed.binding_expires_at || consumed.bindingExpiresAt)) <=
        Date.parse(clean(receipt.abandonedAt)) &&
      Date.parse(clean(consumed.abandoned_at || consumed.abandonedAt)) ===
        Date.parse(clean(receipt.abandonedAt))
    : !clean(receipt.consumeRequestId) &&
      !clean(receipt.consumedAttestationId) &&
      !clean(receipt.consumedAttestationFingerprint) &&
      receipt.consumedProviderAttestation == null;
  if (receipt.status !== "ABANDONED" ||
      receipt.abandonEligible !== false ||
      clean(receipt.abandonmentCode).toUpperCase() !== "ABANDONED" ||
      (!historicalUnconsumedBegin &&
        clean(receipt.abandonmentReason).toUpperCase() !==
          expectedAbandonmentReason) ||
      !sameRetainedChallenge(retained, receipt) ||
      exactUuid(receipt.abandonRequestId,
        "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID") !==
        exactUuid(state[contract.abandonRequestKey],
          "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID") ||
      !Number.isFinite(Date.parse(clean(receipt.abandonedAt))) ||
      !HEX64.test(clean(receipt.abandonRequestFingerprint).toLowerCase()) ||
      !Number.isFinite(Date.parse(clean(receipt.serverObservedAt))) ||
      (!retainedWasConsumed && Date.parse(clean(receipt.abandonedAt)) <
        Date.parse(clean(receipt.expiresAt))) ||
      Date.parse(clean(receipt.serverObservedAt)) <
        Date.parse(clean(receipt.abandonedAt)) ||
      !consumedBindingValid) {
    fail(
      "PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID",
      `The authoritative abandoned challenge receipt did not match this ${contract.stage} attempt.`,
    );
  }
  const next = { ...state };
  const clearStage = (selected) => {
    for (const key of [
      selected.operationKey,
      selected.challengeRequestKey,
      selected.consumeRequestKey,
      selected.challengeKey,
      selected.attesterRequestKey,
      selected.envelopeKey,
      selected.abandonRequestKey,
      selected.abandonmentInspectionKey,
    ]) delete next[key];
  };
  clearStage(contract);
  if (contract.stage === "BEGIN") {
    clearStage(stageContract("FINALIZE"));
    delete next.evidenceRequestId;
    delete next.retainedProviderChallengeInspection;
    if (next.quiesceRefreshPending === true && clean(next.priorEvidenceIdForCycle)) {
      next.quiesceEvidenceId = next.priorEvidenceIdForCycle;
      next.quiesceStatus = "VERIFIED";
      next.quiesceRefreshPending = false;
      delete next.priorEvidenceIdForCycle;
    } else {
      if (new Set(["PROBING", "REFRESH_PENDING"]).has(
        clean(next.quiesceStatus).toUpperCase(),
      )) delete next.quiesceStatus;
      delete next.quiesceRefreshPending;
      delete next.priorEvidenceIdForCycle;
    }
  }
  return Object.freeze(next);
}

export function buildRetainedProviderAttestationChallengePayload(
  recoveryInput,
  purposeInput,
  stageInput = "BEGIN",
) {
  const contract = stageContract(stageInput);
  const state = exactRetainedAttemptState(recoveryInput, contract.stage);
  const challenge = validateRetainedProviderAttestationChallenge(
    state[contract.challengeKey], state, purposeInput, contract.stage,
  );
  if (!new Set(["ISSUED", "CONSUMED"]).has(challenge.status)) {
    fail(
      "PROVIDER_ATTESTATION_RETAINED_CHALLENGE_NOT_RECOVERABLE",
      `Only a retained ISSUED or CONSUMED ${contract.stage} challenge can be recovered.`,
    );
  }
  return Object.freeze({
    quiescePurpose: clean(purposeInput).toUpperCase(),
    evidenceRequestId: state.evidenceRequestId,
    challengeRequestId: state[contract.challengeRequestKey],
    providerAttestationStage: contract.stage,
    providerChallengeId: challenge.challengeId,
    providerRetainedChallenge: challenge,
  });
}

function validatedProviderAttestationChallenge(
  challengeInput,
  state,
  stageInput,
  purposeInput,
  allowedStatuses,
) {
  const contract = stageContract(stageInput);
  const challenge = challengeInput || {};
  const purpose = clean(purposeInput).toUpperCase();
  const status = clean(challenge.status).toUpperCase();
  const issuedAt = Date.parse(clean(challenge.issuedAt));
  const expiresAt = Date.parse(clean(challenge.expiresAt));
  if (challenge.found === false || !allowedStatuses.has(status) ||
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
      !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) ||
      expiresAt <= issuedAt || expiresAt > issuedAt + 120_000 ||
      !DEPLOYMENT_ID.test(clean(challenge.candidateDeploymentId)) ||
      !HEX40.test(clean(challenge.candidateDeploymentCommit).toLowerCase()) ||
      !new Set(["PREVIEW", "PRODUCTION"]).has(
        clean(challenge.candidateDeploymentTarget).toUpperCase(),
      ) || !/^https:\/\/[a-z0-9.-]+$/.test(
        clean(challenge.candidateAliasOrigin).toLowerCase(),
      ) || !/^https:\/\/[a-z0-9.-]+$/.test(
        clean(challenge.candidateImmutableOrigin).toLowerCase(),
      ) || !/^[A-Za-z0-9._:-]{3,160}$/.test(clean(challenge.routingRuleId)) ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(
        clean(challenge.routingRuleConfigVersion),
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

export function validateRetainedProviderAttestationChallenge(
  challengeInput,
  state,
  purposeInput,
  stageInput = "BEGIN",
) {
  return validatedProviderAttestationChallenge(
    challengeInput,
    state,
    stageInput,
    purposeInput,
    new Set(["ISSUED", "CONSUMED", "ABANDONED"]),
  );
}

export function validateProviderAttestationChallenge(
  challengeInput,
  state,
  stageInput,
  purposeInput,
) {
  return validatedProviderAttestationChallenge(
    challengeInput,
    state,
    stageInput,
    purposeInput,
    new Set(["ISSUED", "CONSUMED"]),
  );
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
      clean(claim.schemaVersion) !== PROVIDER_ATTESTATION_CLAIM_SCHEMA ||
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
        clean(challenge.routingRuleConfigVersion) ||
      clean(claim.routingRuleHostnameOperator).toUpperCase() !==
        "DOES_NOT_EQUAL" ||
      clean(claim.routingRuleCanonicalHostname).toLowerCase() !==
        "baggerinv.com" ||
      Number(claim.routingRuleEarlierActiveBypassRuleCount) !== 0) {
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
