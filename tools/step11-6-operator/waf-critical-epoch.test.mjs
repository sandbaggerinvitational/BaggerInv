import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createVercelWafProviderEvidence,
  createVercelWafRuleInsertDispatchResult,
  pinnedEd25519PublicKeyBase64,
  VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
  VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
} from "../../lib/vercel-provider-attestation.js";
import {
  buildProductionGoogleWriterCriticalWindowVercelRuleInsert,
  productionGoogleWriterCriticalWindowProviderRuleContract,
} from "../../lib/production-google-writer-critical-window-waf.js";
import {
  WafEpochOperatorRefusal,
  buildWafCriticalEpochEnvelope,
} from "./waf-critical-epoch.mjs";

const NOW = Date.parse("2026-08-27T12:00:00.000Z");
const TEAM_ID = "team_SandbaggerInvitational01";
const CANDIDATE_ID = "dpl_Step116WafCandidate01";
const CANDIDATE_SHA = "7".repeat(40);
const CANDIDATE_ALIAS =
  "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app";
const CANDIDATE_IMMUTABLE =
  "https://bagger-step116-waf-sandbagger-invitational.vercel.app";
const RULE_NONCE = "10000000-0000-4000-8000-000000000001";
const RULE_NAME = `writer-quiesce-${RULE_NONCE}`;
const RULE_ID = "provider-assigned-waf-rule";
const U = Object.freeze({
  epoch: "20000000-0000-4000-8000-000000000001",
  epochRequest: "20000000-0000-4000-8000-000000000002",
  baselineRequest: "20000000-0000-4000-8000-000000000003",
  baselineEvidence: "20000000-0000-4000-8000-000000000004",
  baselineTransition: "20000000-0000-4000-8000-000000000005",
  baselineObservation: "20000000-0000-4000-8000-000000000006",
  ruleDispatchRequest: "30000000-0000-4000-8000-000000000001",
  ruleDispatch: "30000000-0000-4000-8000-000000000002",
  ruleTransition: "30000000-0000-4000-8000-000000000003",
  ruleResult: "30000000-0000-4000-8000-000000000004",
  activeDispatchRequest: "40000000-0000-4000-8000-000000000001",
  activeDispatch: "40000000-0000-4000-8000-000000000002",
  activeTransition: "40000000-0000-4000-8000-000000000003",
  activeRequest: "40000000-0000-4000-8000-000000000004",
  activeEvidence: "40000000-0000-4000-8000-000000000005",
  activeObservation: "40000000-0000-4000-8000-000000000006",
  reattestRequest: "50000000-0000-4000-8000-000000000001",
  reattestEvidence: "50000000-0000-4000-8000-000000000002",
  reattestTransition: "50000000-0000-4000-8000-000000000003",
  reattestObservation: "50000000-0000-4000-8000-000000000004",
  restoreDispatchRequest: "60000000-0000-4000-8000-000000000001",
  restoreDispatch: "60000000-0000-4000-8000-000000000002",
  restoreTransition: "60000000-0000-4000-8000-000000000003",
  restoreRequest: "60000000-0000-4000-8000-000000000004",
  restoreEvidence: "60000000-0000-4000-8000-000000000005",
  restoreObservation: "60000000-0000-4000-8000-000000000006",
  fence: "70000000-0000-4000-8000-000000000001",
});

const rule = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
  candidateAliasOrigin: CANDIDATE_ALIAS,
  candidateImmutableOrigin: CANDIDATE_IMMUTABLE,
  runOwnedRuleName: RULE_NAME,
  runOwnedRuleNonce: RULE_NONCE,
});
const ruleContract = productionGoogleWriterCriticalWindowProviderRuleContract({
  candidateAliasOrigin: CANDIDATE_ALIAS,
  candidateImmutableOrigin: CANDIDATE_IMMUTABLE,
  runOwnedRuleName: RULE_NAME,
  runOwnedRuleNonce: RULE_NONCE,
});

function baselineFirewall(version = "10") {
  const config = {
    version,
    id: `waf-config-${version}`,
    ownerId: TEAM_ID,
    firewallEnabled: true,
    ips: [],
    crs: [],
    changes: [{ action: "active.read" }],
    projectKey: "bagger-inv-active",
    updatedAt: "2026-08-27T11:59:00.000Z",
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
      updatedAt: "2026-08-27T11:58:00.000Z",
    },
  };
}

function criticalFirewall(version = "11") {
  const config = {
    ...structuredClone(baselineFirewall(version).active),
    rules: [{ id: RULE_ID, ...structuredClone(rule.body.value) }],
  };
  return {
    active: config,
    draft: null,
    versions: [],
    activeVersion: {
      ...structuredClone(config),
      changes: [],
      projectKey: "bagger-inv-version-read",
      updatedAt: "2026-08-27T11:58:00.000Z",
    },
  };
}

function dispatch(dispatchRequestId, transitionRequestId) {
  return {
    dispatchRequestId,
    transitionRequestId,
    dispatchId: null,
    requestFingerprint: null,
    status: "NOT_DISPATCHED",
    dispatchUsable: false,
    replayUsable: false,
  };
}

function evidenceRequest({
  purpose,
  transitionMode,
  stage,
  evidenceRequestId,
  transitionRequestId,
  baselineEvidence = null,
  criticalEvidence = null,
  providerAssignedRuleId = null,
  expectedConfigurationVersion,
} = {}) {
  return {
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
    evidenceRequestId,
    wafEpochId: U.epoch,
    transitionRequestId,
    stage,
    purpose,
    transitionMode,
    projectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    teamId: TEAM_ID,
    candidateAliasOrigin: CANDIDATE_ALIAS,
    candidateImmutableOrigin: CANDIDATE_IMMUTABLE,
    candidateDeploymentId: CANDIDATE_ID,
    candidateCommitSha: CANDIDATE_SHA,
    candidateDeploymentTarget: "PREVIEW",
    runOwnedRuleName: RULE_NAME,
    runOwnedRuleNonce: RULE_NONCE,
    runOwnedRuleFingerprint: rule.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint: rule.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId,
    baselineEvidenceId: baselineEvidence?.evidenceId ?? null,
    criticalEvidenceId: criticalEvidence?.evidenceId ?? null,
    baselineSemanticFingerprint:
      baselineEvidence?.semanticConfigurationFingerprint ?? null,
    criticalSemanticFingerprint:
      criticalEvidence?.semanticConfigurationFingerprint ?? null,
    baselineConfigurationVersion:
      baselineEvidence?.configurationVersion ?? null,
    baselineSourceVersionReadFingerprint:
      baselineEvidence?.sourceVersionReadFingerprint ?? null,
    expectedConfigurationVersion,
  };
}

function fixture({ purpose = "REHEARSAL", transitionMode = "REHEARSAL" } = {}) {
  const keys = generateKeyPairSync("ed25519");
  const baselineRequest = evidenceRequest({
    purpose,
    transitionMode,
    stage: "BASELINE_CAPTURE",
    evidenceRequestId: U.baselineRequest,
    transitionRequestId: U.baselineTransition,
    expectedConfigurationVersion: "10",
  });
  const baselineEnvelope = createVercelWafProviderEvidence({
    request: baselineRequest,
    firewallPayload: baselineFirewall(),
    privateKey: keys.privateKey,
    now: NOW,
    evidenceId: U.baselineEvidence,
  });
  const baselineEvidence = baselineEnvelope.evidence;

  const activeRequest = evidenceRequest({
    purpose,
    transitionMode,
    stage: "CRITICAL_ACTIVE",
    evidenceRequestId: U.activeRequest,
    transitionRequestId: U.activeTransition,
    baselineEvidence,
    providerAssignedRuleId: RULE_ID,
    expectedConfigurationVersion: "11",
  });
  const activeEnvelope = createVercelWafProviderEvidence({
    request: activeRequest,
    firewallPayload: criticalFirewall(),
    privateKey: keys.privateKey,
    now: NOW,
    evidenceId: U.activeEvidence,
  });
  const activeEvidence = activeEnvelope.evidence;

  const reattestRequest = evidenceRequest({
    purpose,
    transitionMode,
    stage: "CRITICAL_REATTEST",
    evidenceRequestId: U.reattestRequest,
    transitionRequestId: U.reattestTransition,
    baselineEvidence,
    criticalEvidence: activeEvidence,
    providerAssignedRuleId: RULE_ID,
    expectedConfigurationVersion: "11",
  });
  const reattestEnvelope = createVercelWafProviderEvidence({
    request: reattestRequest,
    firewallPayload: criticalFirewall(),
    privateKey: keys.privateKey,
    now: NOW,
    evidenceId: U.reattestEvidence,
  });

  const restoreRequest = evidenceRequest({
    purpose,
    transitionMode,
    stage: "BASELINE_RESTORED",
    evidenceRequestId: U.restoreRequest,
    transitionRequestId: U.restoreTransition,
    baselineEvidence,
    criticalEvidence: activeEvidence,
    expectedConfigurationVersion: "10",
  });
  const restoreEnvelope = createVercelWafProviderEvidence({
    request: restoreRequest,
    firewallPayload: baselineFirewall(),
    privateKey: keys.privateKey,
    now: NOW,
    evidenceId: U.restoreEvidence,
  });

  const manifest = {
    mode: "DRY_RUN",
    execution: {
      enabled: false,
      networkAllowed: false,
      providerSdkAllowed: false,
      sqlExecutionAllowed: false,
    },
    resources: {
      environment: "PRODUCTION",
      projectRef: "ymqhhtxaywtqllynrmxe",
      projectUrl: "https://ymqhhtxaywtqllynrmxe.supabase.co",
      sourceWorkbookId: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
      tournamentId: "2026",
      vercelProjectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
      vercelTeamId: TEAM_ID,
    },
    release: {
      frozenSha: CANDIDATE_SHA,
      candidateSha: CANDIDATE_SHA,
      deploymentId: CANDIDATE_ID,
    },
    providerQuiesceEvidence: {
      candidateDeploymentId: CANDIDATE_ID,
      candidateDeploymentCommit: CANDIDATE_SHA,
      candidateAliasOrigin: CANDIDATE_ALIAS,
      candidateImmutableOrigin: CANDIDATE_IMMUTABLE,
    },
    wafCriticalEpoch: {
      contractVersion: "CRITICAL_WINDOW_WAF_V1",
      epochId: U.epoch,
      epochRequestId: U.epochRequest,
      purpose,
      transitionMode,
      status: "MISSING",
      authenticatedActorId: "CB01",
      authenticatedActorFingerprint: "8".repeat(64),
      signerPublicKeyBase64: pinnedEd25519PublicKeyBase64(keys.publicKey),
      candidateDeploymentId: CANDIDATE_ID,
      candidateDeploymentCommit: CANDIDATE_SHA,
      candidateDeploymentTarget: "PREVIEW",
      candidateAliasOrigin: CANDIDATE_ALIAS,
      candidateImmutableOrigin: CANDIDATE_IMMUTABLE,
      candidateControlHostsFingerprint:
        ruleContract.candidateControlHostsFingerprint,
      runOwnedRuleName: RULE_NAME,
      runOwnedRuleNonce: RULE_NONCE,
      runOwnedRuleId: null,
      runOwnedRuleFingerprint: rule.runOwnedRuleFingerprint,
      runOwnedInsertDocumentFingerprint:
        rule.runOwnedInsertDocumentFingerprint,
      boundFenceId: null,
      boundQuiesceEvidenceId: null,
      criticalActiveObservationId: null,
      latestCriticalReattestObservationId: null,
      baselineRestoredObservationId: null,
      criticalActiveAt: null,
      baselineRestoredAt: null,
      aclWriterFenceStatus: "MISSING",
      dispatches: {
        CRITICAL_RULE_INSERT:
          dispatch(U.ruleDispatchRequest, U.ruleTransition),
        CRITICAL_DRAFT_ACTIVATE:
          dispatch(U.activeDispatchRequest, U.activeTransition),
        BASELINE_VERSION_ACTIVATE:
          dispatch(U.restoreDispatchRequest, U.restoreTransition),
      },
      operationInputs: {
        "begin-critical-waf-epoch": {
          baselineObservationRequestId: U.baselineObservation,
          evidenceRequest: baselineRequest,
          evidenceEnvelope: baselineEnvelope,
        },
        "begin-critical-rule-insert-dispatch": {
          providerIntentFingerprint: "1".repeat(64),
        },
        "mark-critical-rule-insert-dispatch-started": {},
        "record-critical-rule-insert-result": {},
        "begin-critical-draft-activate-dispatch": {
          providerIntentFingerprint: "2".repeat(64),
        },
        "mark-critical-draft-activate-dispatch-started": {},
        "record-critical-draft-activate-result": {
          observationRequestId: U.activeObservation,
          evidenceRequest: activeRequest,
          evidenceEnvelope: activeEnvelope,
        },
        "record-critical-waf-reattestation": {
          observationRequestId: U.reattestObservation,
          evidenceRequest: reattestRequest,
          evidenceEnvelope: reattestEnvelope,
        },
        "begin-baseline-version-activate-dispatch": {
          providerIntentFingerprint: "3".repeat(64),
          restoreRequestId: U.restoreRequest,
          restoreRequestFingerprint: "4".repeat(64),
        },
        "mark-baseline-version-activate-dispatch-started": {},
        "record-baseline-version-activate-result": {
          observationRequestId: U.restoreObservation,
          evidenceRequest: restoreRequest,
          evidenceEnvelope: restoreEnvelope,
        },
        "finalize-baseline-restored-fence": {},
      },
    },
  };
  return { manifest, keys, baselineEvidence };
}

function assertRefusal(fn, code) {
  assert.throws(fn, (error) =>
    error instanceof WafEpochOperatorRefusal && error.code === code);
}

test("begin epoch emits the canonical adapter/RPC projection from signed baseline evidence", () => {
  const { manifest } = fixture();
  const result = buildWafCriticalEpochEnvelope(
    manifest, "begin-critical-waf-epoch", { now: NOW + 1_000 },
  );
  assert.equal(result.adapterMethod, "beginCriticalWafEpoch");
  assert.equal(result.payload.epoch_id, U.epoch);
  assert.equal(result.payload.transition_mode, "REHEARSAL");
  assert.equal(result.payload.candidate_deployment_id, CANDIDATE_ID);
  assert.equal(result.payload.candidate_deployment_commit, CANDIDATE_SHA);
  assert.equal(result.payload.candidate_deployment_target, "PREVIEW");
  assert.equal(result.payload.baseline_waf_evidence.signatureVerified, true);
  assert.equal(result.executable, false);
  assert.equal(result.networkCalls, 0);
  assert.equal(result.sqlExecutions, 0);
});

test("begin and mark dispatch emit exact transition-bound capability shapes", () => {
  const { manifest } = fixture();
  manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
  const begin = buildWafCriticalEpochEnvelope(
    manifest, "begin-critical-rule-insert-dispatch", { now: NOW },
  );
  assert.deepEqual(Object.keys(begin.payload).sort(), [
    "actor_id", "authenticated_actor_fingerprint", "dispatch_request_id",
    "dispatch_step", "environment", "epoch_id", "operation", "project_ref", "project_url",
    "provider_intent_fingerprint", "request_fingerprint", "restore_request_fingerprint",
    "restore_request_id", "source_workbook_id", "tournament_id",
    "transition_request_id",
  ].sort());
  assert.equal(begin.payload.transition_request_id, U.ruleTransition);
  assert.equal(begin.payload.restore_request_id, null);

  Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT, {
    status: "RESERVED",
    dispatchId: U.ruleDispatch,
    requestFingerprint: "5".repeat(64),
    dispatchUsable: true,
    replayUsable: true,
  });
  const mark = buildWafCriticalEpochEnvelope(
    manifest, "mark-critical-rule-insert-dispatch-started", { now: NOW },
  );
  assert.deepEqual(mark.payload, {
    operation: "MARK_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_STARTED",
    dispatch_id: U.ruleDispatch,
    dispatch_request_id: U.ruleDispatchRequest,
    transition_request_id: U.ruleTransition,
    request_fingerprint: "5".repeat(64),
  });
});

test("RULE_INSERT result requires signed exact dispatch and candidate scope", () => {
  const { manifest, keys, baselineEvidence } = fixture();
  manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
  Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT, {
    status: "PROVIDER_MUTATING",
    dispatchId: U.ruleDispatch,
    requestFingerprint: "6".repeat(64),
  });
  const request = {
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    dispatchResultId: U.ruleResult,
    dispatchId: U.ruleDispatch,
    dispatchRequestId: U.ruleDispatchRequest,
    wafEpochId: U.epoch,
    transitionRequestId: U.ruleTransition,
    requestFingerprint: "6".repeat(64),
    dispatchStep: "CRITICAL_RULE_INSERT",
    purpose: "REHEARSAL",
    transitionMode: "REHEARSAL",
    projectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    teamId: TEAM_ID,
    candidateAliasOrigin: CANDIDATE_ALIAS,
    candidateImmutableOrigin: CANDIDATE_IMMUTABLE,
    candidateDeploymentId: CANDIDATE_ID,
    candidateCommitSha: CANDIDATE_SHA,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: baselineEvidence.evidenceId,
    baselineConfigurationVersion: baselineEvidence.configurationVersion,
    baselineConfigurationEtag: baselineEvidence.configurationEtag,
    baselineConfigurationIdentityFingerprint:
      baselineEvidence.configurationIdentityFingerprint,
    baselineSourceVersionReadFingerprint:
      baselineEvidence.sourceVersionReadFingerprint,
    baselineSemanticFingerprint: baselineEvidence.semanticConfigurationFingerprint,
    baselineOrderedCustomRulesFingerprint:
      baselineEvidence.orderedCustomRulesFingerprint,
    providerIntentFingerprint: "1".repeat(64),
    runOwnedRuleName: RULE_NAME,
    runOwnedRuleNonce: RULE_NONCE,
    runOwnedRuleFingerprint: rule.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint: rule.runOwnedInsertDocumentFingerprint,
  };
  const envelope = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "OUTCOME_UNKNOWN",
    privateKey: keys.privateKey,
    now: NOW,
  });
  Object.assign(manifest.wafCriticalEpoch.operationInputs[
    "record-critical-rule-insert-result"], {
    dispatchResultRequest: request,
    dispatchResultEnvelope: envelope,
  });
  const result = buildWafCriticalEpochEnvelope(
    manifest, "record-critical-rule-insert-result", { now: NOW + 1_000 },
  );
  assert.equal(result.payload.verified_dispatch_result.outcomeStatus,
    "OUTCOME_UNKNOWN");
  assert.equal(result.payload.verified_dispatch_result.candidateDeploymentId,
    CANDIDATE_ID);
  assert.equal(result.payload.observation_request_id, null);
  assert.equal(result.payload.verified_waf_evidence, null);

  manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT.requestFingerprint =
    "9".repeat(64);
  assertRefusal(() => buildWafCriticalEpochEnvelope(
    manifest, "record-critical-rule-insert-result", { now: NOW + 1_000 },
  ), "WAF_EPOCH_SIGNED_SCOPE_MISMATCH");
});

test("activate, reattest, restore, and finalize stay on one signed epoch", () => {
  const { manifest } = fixture();
  manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
  manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT.status =
    "TARGET_CONFIRMED";
  Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_DRAFT_ACTIVATE, {
    status: "PROVIDER_MUTATING",
    dispatchId: U.activeDispatch,
    requestFingerprint: "a".repeat(64),
  });
  const active = buildWafCriticalEpochEnvelope(
    manifest, "record-critical-draft-activate-result", { now: NOW + 1_000 },
  );
  assert.equal(active.payload.verified_waf_evidence.stage, "CRITICAL_ACTIVE");
  assert.equal(active.payload.observation_request_id, U.activeObservation);

  manifest.wafCriticalEpoch.status = "FENCE_BOUND";
  manifest.wafCriticalEpoch.runOwnedRuleId = RULE_ID;
  manifest.wafCriticalEpoch.boundFenceId = U.fence;
  const reattest = buildWafCriticalEpochEnvelope(
    manifest, "record-critical-waf-reattestation", { now: NOW + 1_000 },
  );
  assert.equal(reattest.payload.verified_waf_evidence.stage,
    "CRITICAL_REATTEST");

  Object.assign(manifest.wafCriticalEpoch.dispatches.BASELINE_VERSION_ACTIVATE, {
    status: "PROVIDER_MUTATING",
    dispatchId: U.restoreDispatch,
    requestFingerprint: "b".repeat(64),
  });
  const restored = buildWafCriticalEpochEnvelope(
    manifest, "record-baseline-version-activate-result", { now: NOW + 1_000 },
  );
  assert.equal(restored.payload.verified_waf_evidence.stage,
    "BASELINE_RESTORED");

  manifest.wafCriticalEpoch.status = "BASELINE_RESTORED";
  manifest.wafCriticalEpoch.aclWriterFenceStatus = "ACL_RESTORED_WAF_ACTIVE";
  manifest.wafCriticalEpoch.baselineRestoredObservationId = U.restoreObservation;
  const final = buildWafCriticalEpochEnvelope(
    manifest, "finalize-baseline-restored-fence", { now: NOW },
  );
  assert.equal(final.adapterMethod, "finalizeWafBaselineRestore");
  assert.equal(final.payload.critical_waf_epoch_id, U.epoch);
  assert.equal(final.payload.baseline_restored_observation_id,
    U.restoreObservation);
});

test("CUTOVER and ROLLBACK both bind the Preview-only control candidate", () => {
  for (const transitionMode of ["CUTOVER", "ROLLBACK"]) {
    const { manifest } = fixture({ purpose: "CUTOVER", transitionMode });
    const result = buildWafCriticalEpochEnvelope(
      manifest, "begin-critical-waf-epoch", { now: NOW + 1_000 },
    );
    assert.equal(result.payload.purpose, "CUTOVER");
    assert.equal(result.payload.transition_mode, transitionMode);
    assert.equal(result.payload.candidate_deployment_target, "PREVIEW");
    assert.equal(result.safety.candidateControlRuntimeTarget, "PREVIEW");
  }
});

test("candidate deployment ID, SHA, target, and origins are fail-closed", () => {
  for (const mutate of [
    (value) => { value.release.deploymentId = "dpl_OtherCandidate123"; },
    (value) => { value.release.frozenSha = "4".repeat(40); value.release.candidateSha = "4".repeat(40); },
    (value) => { value.wafCriticalEpoch.candidateDeploymentTarget = "PRODUCTION"; },
    (value) => { value.wafCriticalEpoch.candidateAliasOrigin = "https://other.vercel.app"; },
    (value) => { value.wafCriticalEpoch.candidateImmutableOrigin = "https://other-immutable.vercel.app"; },
  ]) {
    const { manifest } = fixture();
    mutate(manifest);
    assert.throws(() => buildWafCriticalEpochEnvelope(
      manifest, "begin-critical-waf-epoch", { now: NOW + 1_000 },
    ), WafEpochOperatorRefusal);
  }
});

test("OUTCOME_UNKNOWN is terminal and dry-run policy cannot be relaxed", () => {
  const { manifest } = fixture();
  manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
  manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT.status =
    "OUTCOME_UNKNOWN";
  assertRefusal(() => buildWafCriticalEpochEnvelope(
    manifest, "begin-critical-rule-insert-dispatch", { now: NOW },
  ), "WAF_DISPATCH_UNKNOWN_NO_RETRY");
  const inspect = buildWafCriticalEpochEnvelope(
    manifest, "inspect-critical-waf-unknown", { now: NOW },
  );
  assert.deepEqual(inspect.diagnostics.unknownDispatches,
    ["CRITICAL_RULE_INSERT"]);
  assert.equal(inspect.safety.blindRetryAllowed, false);

  manifest.execution.networkAllowed = true;
  assertRefusal(() => buildWafCriticalEpochEnvelope(
    manifest, "inspect-critical-waf-epoch", { now: NOW },
  ), "WAF_EPOCH_DRY_RUN_REQUIRED");
});

test("signed WAF transition identity cannot drift from its dispatch", () => {
  const { manifest } = fixture();
  manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
  manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT.status =
    "TARGET_CONFIRMED";
  Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_DRAFT_ACTIVATE, {
    status: "PROVIDER_MUTATING",
    dispatchId: U.activeDispatch,
    transitionRequestId: "99999999-0000-4000-8000-000000000001",
  });
  assertRefusal(() => buildWafCriticalEpochEnvelope(
    manifest, "record-critical-draft-activate-result", { now: NOW + 1_000 },
  ), "WAF_EPOCH_SIGNED_SCOPE_MISMATCH");
});
