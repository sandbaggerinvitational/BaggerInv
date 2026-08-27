import { createHash } from "node:crypto";

import {
  verifyVercelWafProviderEvidence,
  verifyVercelWafRuleInsertDispatchResult,
  VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
} from "../../lib/vercel-provider-attestation.js";
import {
  buildProductionGoogleWriterCriticalWindowVercelRuleInsert,
  productionGoogleWriterCriticalWindowProviderRuleContract,
} from "../../lib/production-google-writer-critical-window-waf.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DEPLOYMENT = /^dpl_[A-Za-z0-9]{8,64}$/;
const TEAM = /^team_[A-Za-z0-9]{8,80}$/;
const ORIGIN = /^https:\/\/[a-z0-9.-]+\.vercel\.app$/;
const RULE_ID = /^[A-Za-z0-9_.:-]{3,240}$/;
const RULE_NAME = /^[A-Za-z0-9 ._:-]{3,160}$/;

export const WAF_FIXED = Object.freeze({
  schemaVersion: "bagger-step11.6-waf-critical-epoch-operator-v2",
  contractVersion: "CRITICAL_WINDOW_WAF_V1",
  environment: "PRODUCTION",
  projectRef: "ymqhhtxaywtqllynrmxe",
  projectUrl: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  sourceWorkbookId: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournamentId: "2026",
  vercelProjectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  candidateDeploymentTarget: "PREVIEW",
});

export const WAF_CRITICAL_EPOCH_OPERATIONS = Object.freeze({
  "begin-critical-waf-epoch": {
    kind: "verified-adapter-rpc",
    adapterMethod: "beginCriticalWafEpoch",
    rpc: "begin_production_vercel_writer_critical_waf_epoch",
  },
  "begin-critical-rule-insert-dispatch": {
    kind: "adapter-rpc", adapterMethod: "beginCriticalWafDispatch",
    rpc: "begin_production_vercel_writer_critical_waf_dispatch",
    step: "CRITICAL_RULE_INSERT", stage: "begin",
  },
  "mark-critical-rule-insert-dispatch-started": {
    kind: "adapter-rpc", adapterMethod: "markCriticalWafDispatchStarted",
    rpc: "mark_production_vercel_writer_critical_waf_dispatch_started",
    step: "CRITICAL_RULE_INSERT", stage: "mark",
  },
  "record-critical-rule-insert-result": {
    kind: "verified-adapter-rpc", adapterMethod: "recordCriticalWafDispatchResult",
    rpc: "record_production_vercel_writer_critical_waf_dispatch_result",
    step: "CRITICAL_RULE_INSERT", stage: "result",
  },
  "begin-critical-draft-activate-dispatch": {
    kind: "adapter-rpc", adapterMethod: "beginCriticalWafDispatch",
    rpc: "begin_production_vercel_writer_critical_waf_dispatch",
    step: "CRITICAL_DRAFT_ACTIVATE", stage: "begin",
  },
  "mark-critical-draft-activate-dispatch-started": {
    kind: "adapter-rpc", adapterMethod: "markCriticalWafDispatchStarted",
    rpc: "mark_production_vercel_writer_critical_waf_dispatch_started",
    step: "CRITICAL_DRAFT_ACTIVATE", stage: "mark",
  },
  "record-critical-draft-activate-result": {
    kind: "verified-adapter-rpc", adapterMethod: "recordCriticalWafDispatchResult",
    rpc: "record_production_vercel_writer_critical_waf_dispatch_result",
    step: "CRITICAL_DRAFT_ACTIVATE", stage: "result",
  },
  "record-critical-waf-reattestation": {
    kind: "verified-adapter-rpc", adapterMethod: "recordCriticalWafReattestation",
    rpc: "record_production_vercel_writer_critical_waf_reattestation",
  },
  "begin-baseline-version-activate-dispatch": {
    kind: "adapter-rpc", adapterMethod: "beginCriticalWafDispatch",
    rpc: "begin_production_vercel_writer_critical_waf_dispatch",
    step: "BASELINE_VERSION_ACTIVATE", stage: "begin",
  },
  "mark-baseline-version-activate-dispatch-started": {
    kind: "adapter-rpc", adapterMethod: "markCriticalWafDispatchStarted",
    rpc: "mark_production_vercel_writer_critical_waf_dispatch_started",
    step: "BASELINE_VERSION_ACTIVATE", stage: "mark",
  },
  "record-baseline-version-activate-result": {
    kind: "verified-adapter-rpc", adapterMethod: "recordCriticalWafDispatchResult",
    rpc: "record_production_vercel_writer_critical_waf_dispatch_result",
    step: "BASELINE_VERSION_ACTIVATE", stage: "result",
  },
  "finalize-baseline-restored-fence": {
    kind: "adapter-rpc", adapterMethod: "finalizeWafBaselineRestore",
    rpc: "finalize_production_google_writer_fence_waf_restore",
  },
  "inspect-critical-waf-epoch": {
    kind: "diagnostic-read-only", adapterMethod: null, rpc: null,
  },
  "inspect-critical-waf-unknown": {
    kind: "diagnostic-read-only", adapterMethod: null, rpc: null,
  },
});

export class WafEpochOperatorRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WafEpochOperatorRefusal";
    this.code = code;
  }
}

function refuse(code, message) {
  throw new WafEpochOperatorRefusal(code, message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) refuse("WAF_EPOCH_MANIFEST_INVALID", `${label} must be an object.`);
  return value;
}

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    refuse("WAF_EPOCH_MANIFEST_INVALID", `${label} has an invalid format.`);
  }
  return value;
}

function requireOne(value, allowed, label) {
  if (!allowed.includes(value)) {
    refuse("WAF_EPOCH_STATE_INVALID", `${label} is outside the certified state machine.`);
  }
  return value;
}

function equal(actual, expected, code, label) {
  if (actual !== expected) refuse(code, `${label} did not match the exact candidate scope.`);
  return actual;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function receiptFingerprint(label, fields) {
  return sha256(`${label}\n${JSON.stringify(fields)}`);
}

function providerRequestFingerprint(label, operationRequestFingerprint, ...values) {
  return receiptFingerprint(label, { operationRequestFingerprint, values });
}

function exactScope() {
  return {
    environment: WAF_FIXED.environment,
    project_ref: WAF_FIXED.projectRef,
    project_url: WAF_FIXED.projectUrl,
    source_workbook_id: WAF_FIXED.sourceWorkbookId,
    tournament_id: WAF_FIXED.tournamentId,
  };
}

function common(manifest) {
  const resources = requireObject(manifest.resources, "resources");
  const release = requireObject(manifest.release, "release");
  const epoch = requireObject(manifest.wafCriticalEpoch, "wafCriticalEpoch");
  const exact = [
    [resources.environment, WAF_FIXED.environment, "resources.environment"],
    [resources.projectRef, WAF_FIXED.projectRef, "resources.projectRef"],
    [resources.projectUrl, WAF_FIXED.projectUrl, "resources.projectUrl"],
    [resources.sourceWorkbookId, WAF_FIXED.sourceWorkbookId,
      "resources.sourceWorkbookId"],
    [resources.tournamentId, WAF_FIXED.tournamentId, "resources.tournamentId"],
    [resources.vercelProjectId, WAF_FIXED.vercelProjectId,
      "resources.vercelProjectId"],
  ];
  for (const [actual, expected, label] of exact) {
    if (actual !== expected) refuse("WAF_EPOCH_RESOURCE_MISMATCH", `${label} is not Production.`);
  }
  requireMatch(resources.vercelTeamId, TEAM, "resources.vercelTeamId");
  requireMatch(release.deploymentId, DEPLOYMENT, "release.deploymentId");
  requireMatch(release.frozenSha, HEX40, "release.frozenSha");
  if (release.candidateSha !== release.frozenSha) {
    refuse("WAF_EPOCH_RELEASE_MISMATCH", "The candidate and frozen SHA differ.");
  }
  equal(epoch.candidateDeploymentId, release.deploymentId,
    "WAF_EPOCH_CANDIDATE_MISMATCH", "candidate deployment ID");
  equal(epoch.candidateDeploymentCommit, release.frozenSha,
    "WAF_EPOCH_CANDIDATE_MISMATCH", "candidate commit SHA");
  equal(epoch.candidateDeploymentTarget, WAF_FIXED.candidateDeploymentTarget,
    "WAF_EPOCH_TARGET_MISMATCH", "candidate deployment target");
  const quiesce = manifest.providerQuiesceEvidence;
  if (isObject(quiesce)) {
    for (const [actual, expected, label] of [
      [epoch.candidateDeploymentId, quiesce.candidateDeploymentId, "quiesce deployment ID"],
      [epoch.candidateDeploymentCommit, quiesce.candidateDeploymentCommit,
        "quiesce candidate SHA"],
      [epoch.candidateAliasOrigin, quiesce.candidateAliasOrigin, "quiesce alias origin"],
      [epoch.candidateImmutableOrigin, quiesce.candidateImmutableOrigin,
        "quiesce immutable origin"],
    ]) equal(actual, expected, "WAF_EPOCH_QUIESCE_SCOPE_MISMATCH", label);
  }
  if (epoch.authenticatedActorId !== "CB01") {
    refuse("WAF_EPOCH_ACTOR_MISMATCH", "The authenticated WAF actor must be Director CB01.");
  }
  requireMatch(epoch.authenticatedActorFingerprint, HEX64,
    "wafCriticalEpoch.authenticatedActorFingerprint");
  return Object.freeze({
    resources,
    release,
    actorFields: {
      actor_id: epoch.authenticatedActorId,
      authenticated_actor_fingerprint: epoch.authenticatedActorFingerprint,
    },
    candidateEnvironment: {
      resources: {
        vercelProjectId: resources.vercelProjectId,
        commitSha: release.frozenSha,
        candidateHostname: new URL(epoch.candidateAliasOrigin).hostname,
        deploymentHostname: new URL(epoch.candidateImmutableOrigin).hostname,
      },
    },
  });
}

function dispatchFor(epoch, step) {
  const dispatches = requireObject(epoch.dispatches, "wafCriticalEpoch.dispatches");
  return requireObject(dispatches[step], `wafCriticalEpoch.dispatches.${step}`);
}

function inputFor(epoch, operation) {
  const inputs = requireObject(epoch.operationInputs, "wafCriticalEpoch.operationInputs");
  return requireObject(inputs[operation], `wafCriticalEpoch.operationInputs.${operation}`);
}

function assertEpochShape(manifest, epoch) {
  if (epoch.contractVersion !== WAF_FIXED.contractVersion) {
    refuse("WAF_EPOCH_CONTRACT_MISMATCH", "The critical WAF contract version is stale.");
  }
  const purpose = requireOne(epoch.purpose, ["REHEARSAL", "CUTOVER"],
    "wafCriticalEpoch.purpose");
  const transitionMode = requireOne(epoch.transitionMode,
    ["REHEARSAL", "CUTOVER", "ROLLBACK"], "wafCriticalEpoch.transitionMode");
  if ((purpose === "REHEARSAL") !== (transitionMode === "REHEARSAL")) {
    refuse("WAF_EPOCH_TRANSITION_MODE_MISMATCH",
      "REHEARSAL purpose is exclusive; CUTOVER purpose carries CUTOVER or ROLLBACK mode.");
  }
  requireOne(epoch.status, [
    "MISSING", "ACTIVATION_PENDING", "ACTIVE_UNBOUND", "FENCE_BOUND",
    "RESTORE_PENDING", "BASELINE_RESTORED",
  ], "wafCriticalEpoch.status");
  requireMatch(epoch.epochId, UUID, "wafCriticalEpoch.epochId");
  requireMatch(epoch.epochRequestId, UUID, "wafCriticalEpoch.epochRequestId");
  requireMatch(epoch.candidateDeploymentId, DEPLOYMENT,
    "wafCriticalEpoch.candidateDeploymentId");
  requireMatch(epoch.candidateDeploymentCommit, HEX40,
    "wafCriticalEpoch.candidateDeploymentCommit");
  requireMatch(epoch.candidateAliasOrigin, ORIGIN,
    "wafCriticalEpoch.candidateAliasOrigin");
  requireMatch(epoch.candidateImmutableOrigin, ORIGIN,
    "wafCriticalEpoch.candidateImmutableOrigin");
  if (epoch.candidateAliasOrigin === epoch.candidateImmutableOrigin) {
    refuse("WAF_EPOCH_CANDIDATE_MISMATCH", "Candidate origins must be distinct.");
  }
  requireMatch(epoch.runOwnedRuleName, RULE_NAME, "wafCriticalEpoch.runOwnedRuleName");
  requireMatch(epoch.runOwnedRuleNonce, UUID, "wafCriticalEpoch.runOwnedRuleNonce");
  requireMatch(epoch.runOwnedRuleFingerprint, HEX64,
    "wafCriticalEpoch.runOwnedRuleFingerprint");
  requireMatch(epoch.runOwnedInsertDocumentFingerprint, HEX64,
    "wafCriticalEpoch.runOwnedInsertDocumentFingerprint");
  const rule = productionGoogleWriterCriticalWindowProviderRuleContract({
    candidateAliasOrigin: epoch.candidateAliasOrigin,
    candidateImmutableOrigin: epoch.candidateImmutableOrigin,
    runOwnedRuleName: epoch.runOwnedRuleName,
    runOwnedRuleNonce: epoch.runOwnedRuleNonce,
  });
  const insert = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
    candidateAliasOrigin: epoch.candidateAliasOrigin,
    candidateImmutableOrigin: epoch.candidateImmutableOrigin,
    runOwnedRuleName: epoch.runOwnedRuleName,
    runOwnedRuleNonce: epoch.runOwnedRuleNonce,
  });
  equal(epoch.candidateControlHostsFingerprint,
    rule.candidateControlHostsFingerprint, "WAF_EPOCH_RULE_SCOPE_MISMATCH",
    "candidate-control hosts fingerprint");
  equal(epoch.runOwnedRuleFingerprint, rule.ruleFingerprint,
    "WAF_EPOCH_RULE_SCOPE_MISMATCH", "run-owned rule fingerprint");
  equal(epoch.runOwnedInsertDocumentFingerprint,
    insert.runOwnedInsertDocumentFingerprint, "WAF_EPOCH_RULE_SCOPE_MISMATCH",
    "run-owned insert-document fingerprint");
  if (epoch.runOwnedRuleId !== null) {
    requireMatch(epoch.runOwnedRuleId, RULE_ID, "wafCriticalEpoch.runOwnedRuleId");
  }
  if (["ACTIVE_UNBOUND", "FENCE_BOUND", "RESTORE_PENDING", "BASELINE_RESTORED"]
    .includes(epoch.status) && epoch.runOwnedRuleId === null) {
    refuse("WAF_EPOCH_RULE_ID_REQUIRED",
      "The provider-assigned rule ID is required after critical activation.");
  }
  const context = common(manifest);
  return Object.freeze({ ...context, rule });
}

function signerEnvironment(manifest, context) {
  const publicKey = requireMatch(
    manifest.wafCriticalEpoch.signerPublicKeyBase64,
    /^[A-Za-z0-9+/]{40,}={0,2}$/,
    "wafCriticalEpoch.signerPublicKeyBase64",
  );
  return {
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]: publicKey,
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: context.resources.vercelTeamId,
  };
}

function signedCandidateScope(epoch, evidence) {
  const pairs = [
    [evidence.wafEpochId, epoch.epochId, "evidence epoch"],
    [evidence.purpose, epoch.purpose, "evidence purpose"],
    [evidence.transitionMode, epoch.transitionMode, "evidence transition mode"],
    [evidence.candidateDeploymentId, epoch.candidateDeploymentId,
      "evidence candidate deployment ID"],
    [evidence.candidateCommitSha, epoch.candidateDeploymentCommit,
      "evidence candidate SHA"],
    [evidence.candidateDeploymentTarget, WAF_FIXED.candidateDeploymentTarget,
      "evidence candidate target"],
    [evidence.candidateAliasOrigin, epoch.candidateAliasOrigin,
      "evidence candidate alias"],
    [evidence.candidateImmutableOrigin, epoch.candidateImmutableOrigin,
      "evidence immutable origin"],
    [evidence.runOwnedRuleName, epoch.runOwnedRuleName, "evidence rule name"],
    [evidence.runOwnedRuleNonce, epoch.runOwnedRuleNonce, "evidence rule nonce"],
    [evidence.runOwnedRuleFingerprint, epoch.runOwnedRuleFingerprint,
      "evidence rule fingerprint"],
    [evidence.runOwnedInsertDocumentFingerprint,
      epoch.runOwnedInsertDocumentFingerprint, "evidence insert fingerprint"],
  ];
  for (const [actual, expected, label] of pairs) {
    equal(actual, expected, "WAF_EPOCH_SIGNED_SCOPE_MISMATCH", label);
  }
  return evidence;
}

function evidenceScope(epoch, evidence, expectedStage) {
  equal(evidence.stage, expectedStage, "WAF_EPOCH_SIGNED_SCOPE_MISMATCH",
    "evidence stage");
  return signedCandidateScope(epoch, evidence);
}

function verifiedWafEvidence(manifest, epoch, context, input, expectedStage, now) {
  const request = requireObject(input.evidenceRequest, "evidenceRequest");
  const envelope = requireObject(input.evidenceEnvelope, "evidenceEnvelope");
  let evidence;
  try {
    evidence = verifyVercelWafProviderEvidence(envelope, {
      request,
      env: signerEnvironment(manifest, context),
      now,
    });
  } catch (error) {
    refuse(error?.code || "WAF_EPOCH_SIGNED_EVIDENCE_INVALID",
      "The signed WAF provider evidence did not verify.");
  }
  return evidenceScope(epoch, evidence, expectedStage);
}

function verifiedRuleInsertResult(manifest, epoch, context, input, step, now) {
  const request = requireObject(input.dispatchResultRequest, "dispatchResultRequest");
  const envelope = requireObject(input.dispatchResultEnvelope, "dispatchResultEnvelope");
  let evidence;
  try {
    evidence = verifyVercelWafRuleInsertDispatchResult(envelope, {
      request,
      env: signerEnvironment(manifest, context),
      now,
    });
  } catch (error) {
    refuse(error?.code || "WAF_EPOCH_SIGNED_RESULT_INVALID",
      "The signed WAF dispatch result did not verify.");
  }
  signedCandidateScope(epoch, evidence);
  equal(evidence.dispatchStep, step, "WAF_EPOCH_SIGNED_SCOPE_MISMATCH",
    "dispatch-result step");
  return evidence;
}

function assertDispatchStartable(epoch, step) {
  const dispatch = dispatchFor(epoch, step);
  if (dispatch.status === "OUTCOME_UNKNOWN") {
    refuse("WAF_DISPATCH_UNKNOWN_NO_RETRY",
      `${step} is OUTCOME_UNKNOWN; inspect only and never redispatch.`);
  }
  if (dispatch.status !== "NOT_DISPATCHED") {
    refuse("WAF_DISPATCH_REPLAY_FORBIDDEN",
      `${step} already has a durable dispatch; a second dispatch is forbidden.`);
  }
  if (step === "CRITICAL_RULE_INSERT" && epoch.status !== "ACTIVATION_PENDING") {
    refuse("WAF_EPOCH_STATE_INVALID", "Rule insertion requires ACTIVATION_PENDING.");
  }
  if (step === "CRITICAL_DRAFT_ACTIVATE" &&
      (epoch.status !== "ACTIVATION_PENDING" ||
        dispatchFor(epoch, "CRITICAL_RULE_INSERT").status !== "TARGET_CONFIRMED")) {
    refuse("WAF_EPOCH_STATE_INVALID",
      "Draft activation requires one confirmed rule insertion.");
  }
  if (step === "BASELINE_VERSION_ACTIVATE" && epoch.status !== "FENCE_BOUND") {
    refuse("WAF_EPOCH_STATE_INVALID",
      "Baseline restoration requires the exact FENCE_BOUND epoch.");
  }
  return dispatch;
}

function beginEpochContract(manifest, epoch, context, input, now) {
  if (epoch.status !== "MISSING") {
    refuse("WAF_EPOCH_REUSE_FORBIDDEN", "A historical or active epoch cannot begin again.");
  }
  const evidence = verifiedWafEvidence(
    manifest, epoch, context, input, "BASELINE_CAPTURE", now,
  );
  const baselineObservationRequestId = requireMatch(
    input.baselineObservationRequestId, UUID, "baselineObservationRequestId");
  const requestFingerprint = providerRequestFingerprint(
    "production-vercel-writer-critical-waf-epoch-begin-v1",
    evidence.evidenceFingerprint,
    evidence.wafEpochId,
    epoch.epochRequestId,
    baselineObservationRequestId,
  );
  return {
    adapterDetails: {
      evidenceEnvelope: input.evidenceEnvelope,
      evidenceRequest: input.evidenceRequest,
      environment: context.candidateEnvironment,
      epochRequestId: epoch.epochRequestId,
      baselineObservationRequestId,
    },
    rpcPayload: {
      ...exactScope(),
      operation: "BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH",
      epoch_id: evidence.wafEpochId,
      epoch_request_id: epoch.epochRequestId,
      baseline_observation_request_id: baselineObservationRequestId,
      purpose: evidence.purpose,
      transition_mode: evidence.transitionMode,
      request_fingerprint: requestFingerprint,
      candidate_deployment_id: evidence.candidateDeploymentId,
      candidate_deployment_commit: evidence.candidateCommitSha,
      candidate_deployment_target: evidence.candidateDeploymentTarget,
      candidate_alias_origin: evidence.candidateAliasOrigin,
      candidate_immutable_origin: evidence.candidateImmutableOrigin,
      candidate_control_hosts_fingerprint:
        context.rule.candidateControlHostsFingerprint,
      baseline_waf_evidence: evidence,
      ...context.actorFields,
    },
  };
}

function beginDispatchContract(epoch, context, input, step) {
  const dispatch = assertDispatchStartable(epoch, step);
  const transitionRequestId = requireMatch(dispatch.transitionRequestId, UUID,
    `dispatches.${step}.transitionRequestId`);
  const providerIntentFingerprint = requireMatch(input.providerIntentFingerprint,
    HEX64, "providerIntentFingerprint");
  const details = {
    epochId: epoch.epochId,
    dispatchRequestId: requireMatch(dispatch.dispatchRequestId, UUID,
      `dispatches.${step}.dispatchRequestId`),
    transitionRequestId,
    dispatchStep: step,
    providerIntentFingerprint,
  };
  if (step === "BASELINE_VERSION_ACTIVATE") {
    details.restoreRequestId = requireMatch(input.restoreRequestId, UUID,
      "restoreRequestId");
    details.restoreRequestFingerprint = requireMatch(
      input.restoreRequestFingerprint, HEX64, "restoreRequestFingerprint");
  }
  const requestFingerprint = providerRequestFingerprint(
    "production-vercel-writer-critical-waf-dispatch-begin-v1",
    epoch.epochId,
    details.dispatchRequestId,
    transitionRequestId,
    step,
    providerIntentFingerprint,
  );
  return {
    adapterDetails: details,
    rpcPayload: {
      ...exactScope(),
      operation: "BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH",
      epoch_id: epoch.epochId,
      dispatch_request_id: details.dispatchRequestId,
      transition_request_id: transitionRequestId,
      dispatch_step: step,
      provider_intent_fingerprint: providerIntentFingerprint,
      request_fingerprint: requestFingerprint,
      restore_request_id: details.restoreRequestId || null,
      restore_request_fingerprint: details.restoreRequestFingerprint || null,
      ...context.actorFields,
    },
  };
}

function markDispatchContract(epoch, step) {
  const dispatch = dispatchFor(epoch, step);
  if (dispatch.status === "OUTCOME_UNKNOWN") {
    refuse("WAF_DISPATCH_UNKNOWN_NO_RETRY", "OUTCOME_UNKNOWN is inspect-only.");
  }
  if (dispatch.status !== "RESERVED" || dispatch.dispatchUsable !== true ||
      dispatch.replayUsable !== true) {
    refuse("WAF_DISPATCH_NOT_USABLE",
      "Only the first unexpired RESERVED capability may cross the provider boundary.");
  }
  const details = {
    dispatchId: requireMatch(dispatch.dispatchId, UUID, `dispatches.${step}.dispatchId`),
    dispatchRequestId: requireMatch(dispatch.dispatchRequestId, UUID,
      `dispatches.${step}.dispatchRequestId`),
    transitionRequestId: requireMatch(dispatch.transitionRequestId, UUID,
      `dispatches.${step}.transitionRequestId`),
    requestFingerprint: requireMatch(dispatch.requestFingerprint, HEX64,
      `dispatches.${step}.requestFingerprint`),
  };
  return {
    adapterDetails: details,
    rpcPayload: {
      operation: "MARK_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_STARTED",
      dispatch_id: details.dispatchId,
      dispatch_request_id: details.dispatchRequestId,
      transition_request_id: details.transitionRequestId,
      request_fingerprint: details.requestFingerprint,
    },
  };
}

function recordDispatchContract(manifest, epoch, context, input, step, now) {
  const dispatch = dispatchFor(epoch, step);
  if (dispatch.status !== "PROVIDER_MUTATING") {
    refuse("WAF_DISPATCH_RESULT_NOT_RECORDABLE",
      "A result may be recorded only for the exact PROVIDER_MUTATING dispatch.");
  }
  const dispatchId = requireMatch(dispatch.dispatchId, UUID,
    `dispatches.${step}.dispatchId`);
  let verifiedDispatchResult = null;
  let verifiedWafEvidence = null;
  let observationRequestId = null;
  let adapterDetails;
  if (step === "CRITICAL_RULE_INSERT") {
    verifiedDispatchResult = verifiedRuleInsertResult(
      manifest, epoch, context, input, step, now,
    );
    equal(verifiedDispatchResult.dispatchId, dispatchId,
      "WAF_EPOCH_SIGNED_SCOPE_MISMATCH", "signed dispatch ID");
    equal(verifiedDispatchResult.dispatchRequestId, dispatch.dispatchRequestId,
      "WAF_EPOCH_SIGNED_SCOPE_MISMATCH", "signed dispatch request ID");
    equal(verifiedDispatchResult.transitionRequestId, dispatch.transitionRequestId,
      "WAF_EPOCH_SIGNED_SCOPE_MISMATCH", "signed transition request ID");
    equal(verifiedDispatchResult.requestFingerprint, dispatch.requestFingerprint,
      "WAF_EPOCH_SIGNED_SCOPE_MISMATCH", "signed dispatch request fingerprint");
    adapterDetails = {
      dispatchId,
      dispatchResultEnvelope: input.dispatchResultEnvelope,
      dispatchResultRequest: input.dispatchResultRequest,
    };
  } else {
    const expectedStage = step === "CRITICAL_DRAFT_ACTIVATE"
      ? "CRITICAL_ACTIVE" : "BASELINE_RESTORED";
    verifiedWafEvidence = verifiedWafEvidenceForDispatch(
      manifest, epoch, context, input, expectedStage, now,
    );
    equal(verifiedWafEvidence.transitionRequestId, dispatch.transitionRequestId,
      "WAF_EPOCH_SIGNED_SCOPE_MISMATCH", "signed transition request ID");
    observationRequestId = requireMatch(input.observationRequestId, UUID,
      "observationRequestId");
    adapterDetails = {
      dispatchId,
      wafEvidenceEnvelope: input.evidenceEnvelope,
      wafEvidenceRequest: input.evidenceRequest,
      observationRequestId,
    };
  }
  const fingerprint = verifiedDispatchResult?.evidenceFingerprint ??
    verifiedWafEvidence?.evidenceFingerprint;
  return {
    adapterDetails,
    rpcPayload: {
      operation: "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_RESULT",
      dispatch_id: dispatchId,
      request_fingerprint: providerRequestFingerprint(
        "production-vercel-writer-critical-waf-dispatch-result-v1",
        dispatchId,
        fingerprint,
      ),
      observation_request_id: verifiedWafEvidence ? observationRequestId : null,
      verified_dispatch_result: verifiedDispatchResult,
      verified_waf_evidence: verifiedWafEvidence,
    },
  };
}

function verifiedWafEvidenceForDispatch(
  manifest, epoch, context, input, expectedStage, now,
) {
  return verifiedWafEvidence(manifest, epoch, context, input, expectedStage, now);
}

function reattestContract(manifest, epoch, context, input, now) {
  if (epoch.status !== "FENCE_BOUND") {
    refuse("WAF_EPOCH_STATE_INVALID", "Critical reattestation requires FENCE_BOUND.");
  }
  const evidence = verifiedWafEvidence(
    manifest, epoch, context, input, "CRITICAL_REATTEST", now,
  );
  const observationRequestId = requireMatch(input.observationRequestId, UUID,
    "observationRequestId");
  return {
    adapterDetails: {
      evidenceEnvelope: input.evidenceEnvelope,
      evidenceRequest: input.evidenceRequest,
      observationRequestId,
    },
    rpcPayload: {
      operation: "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTESTATION",
      epoch_id: evidence.wafEpochId,
      observation_request_id: observationRequestId,
      request_fingerprint: providerRequestFingerprint(
        "production-vercel-writer-critical-waf-reattest-v1",
        evidence.evidenceFingerprint,
        observationRequestId,
      ),
      verified_waf_evidence: evidence,
    },
  };
}

function finalizeContract(epoch, context) {
  if (epoch.status !== "BASELINE_RESTORED" ||
      epoch.aclWriterFenceStatus !== "ACL_RESTORED_WAF_ACTIVE") {
    refuse("WAF_BASELINE_FINALIZE_STATE_INVALID",
      "Finalization requires BASELINE_RESTORED plus ACL_RESTORED_WAF_ACTIVE.");
  }
  const fenceId = requireMatch(epoch.boundFenceId, UUID, "wafCriticalEpoch.boundFenceId");
  const observationId = requireMatch(epoch.baselineRestoredObservationId, UUID,
    "wafCriticalEpoch.baselineRestoredObservationId");
  return {
    adapterDetails: {
      fenceId,
      epochId: epoch.epochId,
      baselineRestoredObservationId: observationId,
    },
    rpcPayload: {
      ...exactScope(),
      operation:
        "FINALIZE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_WAF_BASELINE_RESTORE",
      fence_id: fenceId,
      critical_waf_epoch_id: epoch.epochId,
      baseline_restored_observation_id: observationId,
      request_fingerprint: providerRequestFingerprint(
        "production-google-writer-provider-waf-baseline-finalize-v1",
        fenceId,
        epoch.epochId,
        observationId,
      ),
      ...context.actorFields,
    },
  };
}

function diagnostics(epoch) {
  const dispatches = Object.fromEntries(Object.entries(epoch.dispatches).map(
    ([step, value]) => [step, {
      status: value.status,
      dispatchId: value.dispatchId ?? null,
      dispatchRequestId: value.dispatchRequestId,
      transitionRequestId: value.transitionRequestId,
      dispatchUsable: value.dispatchUsable === true,
      replayUsable: value.replayUsable === true,
    }],
  ));
  const unknown = Object.entries(dispatches)
    .filter(([, value]) => value.status === "OUTCOME_UNKNOWN")
    .map(([step]) => step);
  return {
    contractVersion: epoch.contractVersion,
    epochId: epoch.epochId,
    epochRequestId: epoch.epochRequestId,
    purpose: epoch.purpose,
    transitionMode: epoch.transitionMode,
    candidateDeploymentId: epoch.candidateDeploymentId,
    candidateDeploymentCommit: epoch.candidateDeploymentCommit,
    candidateDeploymentTarget: epoch.candidateDeploymentTarget,
    candidateAliasOrigin: epoch.candidateAliasOrigin,
    candidateImmutableOrigin: epoch.candidateImmutableOrigin,
    status: epoch.status,
    criticalWindowActive: ["ACTIVE_UNBOUND", "FENCE_BOUND", "RESTORE_PENDING"]
      .includes(epoch.status),
    fenceBound: ["FENCE_BOUND", "RESTORE_PENDING", "BASELINE_RESTORED"]
      .includes(epoch.status),
    boundFenceId: epoch.boundFenceId ?? null,
    boundQuiesceEvidenceId: epoch.boundQuiesceEvidenceId ?? null,
    criticalActiveObservationId: epoch.criticalActiveObservationId ?? null,
    latestCriticalReattestObservationId:
      epoch.latestCriticalReattestObservationId ?? null,
    baselineRestoredObservationId: epoch.baselineRestoredObservationId ?? null,
    criticalActiveAt: epoch.criticalActiveAt ?? null,
    baselineRestoredAt: epoch.baselineRestoredAt ?? null,
    baselineRestored: epoch.status === "BASELINE_RESTORED",
    unknownDispatches: unknown,
    unknownDispatchCount: unknown.length,
    redispatchAllowed: unknown.length === 0,
    aclWriterFenceStatus: epoch.aclWriterFenceStatus ?? null,
    exactFenceBindingReady: epoch.status === "ACTIVE_UNBOUND",
    terminalCertificationReady: epoch.status === "BASELINE_RESTORED" &&
      epoch.aclWriterFenceStatus === "REHEARSAL_RESTORED",
  };
}

export function buildWafCriticalEpochEnvelope(manifest, operation, {
  now = Date.now(),
} = {}) {
  const definition = WAF_CRITICAL_EPOCH_OPERATIONS[operation];
  if (!definition) refuse("WAF_EPOCH_OPERATION_UNKNOWN", `Unknown operation: ${operation}`);
  if (manifest?.mode !== "DRY_RUN" || manifest?.execution?.enabled !== false ||
      manifest?.execution?.networkAllowed !== false ||
      manifest?.execution?.providerSdkAllowed !== false ||
      manifest?.execution?.sqlExecutionAllowed !== false) {
    refuse("WAF_EPOCH_DRY_RUN_REQUIRED", "The Step 11.6 operator remains dry-run only.");
  }
  const epoch = requireObject(manifest.wafCriticalEpoch, "wafCriticalEpoch");
  const context = assertEpochShape(manifest, epoch);
  const input = definition.kind === "diagnostic-read-only" ? {} : inputFor(epoch, operation);
  let contract = { adapterDetails: null, rpcPayload: null };
  if (operation === "begin-critical-waf-epoch") {
    contract = beginEpochContract(manifest, epoch, context, input, now);
  } else if (definition.stage === "begin") {
    contract = beginDispatchContract(epoch, context, input, definition.step);
  } else if (definition.stage === "mark") {
    contract = markDispatchContract(epoch, definition.step);
  } else if (definition.stage === "result") {
    contract = recordDispatchContract(
      manifest, epoch, context, input, definition.step, now,
    );
  } else if (operation === "record-critical-waf-reattestation") {
    contract = reattestContract(manifest, epoch, context, input, now);
  } else if (operation === "finalize-baseline-restored-fence") {
    contract = finalizeContract(epoch, context);
  } else if (operation === "inspect-critical-waf-unknown" &&
      diagnostics(epoch).unknownDispatchCount === 0) {
    refuse("WAF_DISPATCH_UNKNOWN_ABSENT", "No OUTCOME_UNKNOWN dispatch exists.");
  }
  const state = diagnostics(epoch);
  const envelope = {
    schemaVersion: WAF_FIXED.schemaVersion,
    mode: "DRY_RUN",
    executable: false,
    networkCalls: 0,
    providerSdkCalls: 0,
    sqlExecutions: 0,
    operation,
    kind: definition.kind,
    adapterMethod: definition.adapterMethod,
    rpc: definition.rpc,
    adapterCall: definition.adapterMethod ? {
      dependencyFactory: "productionGoogleWriterProviderFenceControlDependencies",
      method: definition.adapterMethod,
      details: contract.adapterDetails,
    } : null,
    payload: contract.rpcPayload,
    sqlEnvelope: definition.rpc
      ? `select public.${definition.rpc}($wafepoch$${canonical(contract.rpcPayload)}$wafepoch$::jsonb);`
      : null,
    diagnostics: state,
    safety: {
      candidateDeploymentIdShaOriginsExactBound: true,
      candidateControlRuntimeTarget: WAF_FIXED.candidateDeploymentTarget,
      unknownIsTerminal: true,
      blindRetryAllowed: false,
      providerMutationRequiresFreshDispatchCapability: true,
      baselineRestoredTerminal: true,
      directExecutionAvailable: false,
      verifiedAdapterRequired: definition.kind === "verified-adapter-rpc",
    },
    warning: "REVIEW ARTIFACT ONLY — NO PROVIDER OR PRODUCTION CALL IS EXECUTED",
  };
  envelope.envelopeFingerprint = sha256(canonical(envelope));
  return envelope;
}
