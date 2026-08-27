"use client";

import { useEffect, useState } from "react";

import {
  buildProviderQuiesceStagePayload,
  buildRetainedProviderAttestationChallengePayload,
  canAbandonRetainedProviderAttestationChallenge,
  canExecuteProviderQuiesceStage,
  discardAbandonedProviderAttestationAttempt,
  ensureProviderAttestationStageState,
  providerAttestationStageKeys,
  validateLoadedProviderAttestationEnvelope,
  validateProviderAttestationChallenge,
  validateProviderAttestationRequest,
  validateRetainedProviderAttestationChallenge,
} from "../../../lib/production-google-writer-fence-attestation-client.js";
import styles from "./writer-fence.module.css";

const API_PATH = "/api/admin/step11-6-production-google-writer-fence";
const DRIVE_ACL_DOWNGRADE_CONFIRMATION = "STEP12_GOOGLE_WRITER_PROVIDER_FENCE";
const DRIVE_ACL_RESTORE_CONFIRMATION =
  "ABORT_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL";
const OWNER_FREEZE_CONFIRMATION =
  "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL";
const STORAGE_KEY = "bagger.step11-6.drive-acl-rehearsal.recovery.v3";

function requestId() {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new Error("Secure browser request identities are unavailable.");
  return value;
}

function retainedState() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export default function WriterFenceClient({ environment }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [recovery, setRecovery] = useState({});
  const [ownerFreezeConfirmed, setOwnerFreezeConfirmed] = useState(false);
  const [routingRuleId, setRoutingRuleId] = useState("");
  const [routingRuleRevision, setRoutingRuleRevision] = useState("");
  const inspection = result?.inspection || null;
  const baseline = inspection?.baselineMetadataFingerprint || recovery.baseline || "";
  const noSheetsTransportSentinel =
    inspection?.noSheetsTransportSentinelFingerprint ||
    recovery.noSheetsTransportSentinel || "";
  const legacyDriveRole = inspection?.drivePermissionAudit?.legacyIdentityRole ||
    inspection?.driveAcl?.legacyRole || inspection?.legacyRole ||
    recovery.legacyDriveRole || "UNKNOWN";
  const criticalWafEpoch = result?.wafEpoch || result?.criticalWafEpoch ||
    inspection?.criticalWafEpoch || recovery.criticalWafEpoch || {};
  const criticalWafEpochId = criticalWafEpoch.epochId ||
    result?.controlReceipt?.criticalWafEpochId ||
    recovery.criticalWafEpochId || "";
  const criticalWafStatus = criticalWafEpoch.status ||
    recovery.criticalWafStatus || "";
  const criticalWafObservationId = criticalWafStatus === "FENCE_BOUND"
    ? criticalWafEpoch.latestCriticalReattestObservationId ||
      recovery.latestCriticalReattestObservationId || ""
    : criticalWafEpoch.criticalActiveObservationId ||
      recovery.criticalActiveObservationId || "";
  const criticalWafQuiesceStage = criticalWafStatus === "FENCE_BOUND"
    ? "RESTORE_REATTEST" : "INSTALL";
  const wafInstallComplete = new Set([
    "ACTIVE_UNBOUND", "FENCE_BOUND", "RESTORE_PENDING", "BASELINE_RESTORED",
  ]).has(criticalWafStatus);
  const wafReattestationComplete = criticalWafStatus === "FENCE_BOUND" &&
    Boolean(criticalWafEpoch.latestCriticalReattestObservationId ||
      recovery.latestCriticalReattestObservationId);
  const wafBaselineRestored = criticalWafStatus === "BASELINE_RESTORED";
  const aclDowngradeStatus = recovery.aclDowngradeStatus || "";
  const aclSettlementComplete = aclDowngradeStatus === "INSTALLED";
  const verifiedQuiesce = recovery.quiesceStatus === "VERIFIED" &&
    recovery.quiesceEvidenceId;
  const beginExecutable = canExecuteProviderQuiesceStage(recovery, "BEGIN");
  const finalizeExecutable = canExecuteProviderQuiesceStage(recovery, "FINALIZE");
  const beginAbandonable = canAbandonRetainedProviderAttestationChallenge(
    recovery,
    recovery.beginProviderChallengeAbandonmentInspection ||
      recovery.retainedProviderChallengeInspection,
    "REHEARSAL",
    "BEGIN",
  );
  const finalizeAbandonable = canAbandonRetainedProviderAttestationChallenge(
    recovery,
    recovery.finalizeProviderChallengeAbandonmentInspection,
    "REHEARSAL",
    "FINALIZE",
  );

  useEffect(() => {
    const retained = retainedState();
    setRecovery(retained);
    setRoutingRuleId(retained.routingRuleId || "");
    setRoutingRuleRevision(retained.routingRuleRevision || "");
  }, []);

  function retain(update) {
    setRecovery((current) => {
      const next = { ...current, ...update };
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function routingRule() {
    return {
      projectId: environment.resources.vercelProjectId,
      ruleId: routingRuleId.trim(),
      revision: routingRuleRevision.trim(),
      scope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
      projectWide: true,
      action: "DENY",
      hostnameOperator: "DOES_NOT_EQUAL",
      canonicalHostname: "baggerinv.com",
      requestPathOperator: "DOES_NOT_EQUAL",
      requestPath: API_PATH,
      methodOperator: "IS_NOT_ANY_OF",
      methods: ["GET", "HEAD", "OPTIONS"],
      allMethodFenceRequiredHostCount:
        environment.safety.allMethodFenceRequiredHostCount,
      allMethodFenceRequiredHostsFingerprint:
        environment.safety.allMethodFenceRequiredHostsFingerprint,
      allMethodFenceRequiredPathCount:
        environment.safety.allMethodFenceRequiredPathCount,
      allMethodFenceRequiredPathsFingerprint:
        environment.safety.allMethodFenceRequiredPathsFingerprint,
    };
  }

  function clientError(error, fallbackCode) {
    setError({
      code: error?.code || fallbackCode,
      error: error?.message || "The local provider-attestation contract failed closed.",
      diagnostics: error?.diagnostics || null,
    });
  }

  function storeExact(next) {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    setRecovery(next);
  }

  async function inspectRetainedChallenge(stage) {
    const keys = providerAttestationStageKeys(stage);
    let payload;
    try {
      payload = buildRetainedProviderAttestationChallengePayload(
        recovery, "REHEARSAL", keys.stage,
      );
    } catch (cause) {
      clientError(
        cause,
        "STEP11_6_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID",
      );
      return;
    }
    const body = await post(
      "inspect-retained-provider-attestation-challenge",
      payload,
      recovery[keys.operationKey],
    );
    if (!body?.challenge) return;
    try {
      const inspection = validateRetainedProviderAttestationChallenge(
        body.challenge, recovery, "REHEARSAL", keys.stage,
      );
      retain({
        [keys.abandonmentInspectionKey]: inspection,
        ...(inspection.status === "CONSUMED"
          ? { [keys.challengeKey]: inspection }
          : {}),
      });
    } catch (cause) {
      clientError(
        cause,
        "STEP11_6_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID",
      );
    }
  }

  async function abandonRetainedChallenge(stage) {
    const keys = providerAttestationStageKeys(stage);
    const abandonable = keys.stage === "BEGIN" ? beginAbandonable : finalizeAbandonable;
    let stable;
    let payload;
    try {
      if (!abandonable) {
        throw Object.assign(new Error(
          `The retained ${keys.stage} challenge is not authoritatively eligible for abandonment.`,
        ), { code: "PROVIDER_ATTESTATION_ABANDON_NOT_ELIGIBLE" });
      }
      const abandonRequestId = recovery[keys.abandonRequestKey] || requestId();
      stable = { ...recovery, [keys.abandonRequestKey]: abandonRequestId };
      payload = buildRetainedProviderAttestationChallengePayload(
        stable, "REHEARSAL", keys.stage,
      );
      storeExact(stable);
    } catch (cause) {
      clientError(
        cause,
        "STEP11_6_PROVIDER_ATTESTATION_ABANDON_REQUEST_INVALID",
      );
      return;
    }
    const body = await post(
      "abandon-provider-attestation-challenge",
      { ...payload, abandonRequestId: stable[keys.abandonRequestKey] },
      stable[keys.operationKey],
    );
    if (!body?.challenge) return;
    try {
      const next = discardAbandonedProviderAttestationAttempt(
        stable,
        body.challenge,
        "REHEARSAL",
        keys.stage,
      );
      storeExact(next);
      if (keys.stage === "BEGIN") {
        setOwnerFreezeConfirmed(false);
      }
      setError(null);
      setResult(body);
    } catch (cause) {
      clientError(
        cause,
        "STEP11_6_PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID",
      );
    }
  }

  async function issueChallenge(stage) {
    const keys = providerAttestationStageKeys(stage);
    let stable;
    try {
      let cycle = recovery;
      if (keys.stage === "BEGIN" && recovery.quiesceStatus === "VERIFIED" &&
          recovery.quiesceEvidenceId && recovery.quiesceRefreshPending !== true) {
        cycle = {
          ...recovery,
          quiesceRefreshPending: true,
          priorEvidenceIdForCycle: recovery.quiesceEvidenceId,
          quiesceStatus: "REFRESH_PENDING",
          evidenceRequestId: "",
          beginOperationRequestId: "",
          beginChallengeRequestId: "",
          beginConsumeRequestId: "",
          beginProviderChallenge: null,
          beginProviderAttestationRequest: null,
          beginSignedProviderAttestation: null,
          finalizeOperationRequestId: "",
          finalizeChallengeRequestId: "",
          finalizeConsumeRequestId: "",
          finalizeProviderChallenge: null,
          finalizeProviderAttestationRequest: null,
          finalizeSignedProviderAttestation: null,
        };
      }
      stable = ensureProviderAttestationStageState(cycle, stage, requestId);
      storeExact(stable);
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_REQUEST_ID_INVALID");
      return;
    }
    const body = await post("issue-provider-attestation-challenge", {
      quiescePurpose: "REHEARSAL",
      evidenceRequestId: stable.evidenceRequestId,
      challengeRequestId: stable[keys.challengeRequestKey],
      providerAttestationStage: keys.stage,
      routingRule: routingRule(),
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
    }, stable[keys.operationKey]);
    if (!body?.challenge || !body?.providerAttestationRequest) return;
    try {
      const challenge = validateProviderAttestationChallenge(
        body.challenge, stable, keys.stage, "REHEARSAL",
      );
      const request = validateProviderAttestationRequest(
        body.providerAttestationRequest, challenge,
      );
      const priorChallenge = stable[keys.challengeKey];
      storeExact({
        ...stable,
        [keys.challengeKey]: challenge,
        [keys.attesterRequestKey]: request,
        ...(priorChallenge?.challengeId === challenge.challengeId
          ? {} : { [keys.envelopeKey]: null }),
      });
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_CHALLENGE_INVALID");
    }
  }

  function downloadAttesterRequest(stage) {
    const keys = providerAttestationStageKeys(stage);
    const request = recovery[keys.attesterRequestKey];
    if (!request) {
      clientError(null, "STEP11_6_PROVIDER_ATTESTATION_REQUEST_REQUIRED");
      return;
    }
    const blob = new Blob([`${JSON.stringify({ providerAttestationRequest: request }, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `step11-6-${keys.prefix}-provider-attestation-request.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadSignedAttestation(stage, event) {
    const keys = providerAttestationStageKeys(stage);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const envelope = JSON.parse(await file.text());
      const challenge = validateProviderAttestationChallenge(
        recovery[keys.challengeKey], recovery, keys.stage, "REHEARSAL",
      );
      const validated = validateLoadedProviderAttestationEnvelope(envelope, challenge);
      retain({ [keys.envelopeKey]: validated });
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_FILE_INVALID");
    }
  }

  async function post(action, payload, stableRequestId) {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(API_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          operationRequestId: stableRequestId,
          expectedCommitSha: environment.resources.commitSha,
          expectedWorkbookId: environment.resources.workbookId,
          expectedBranch: environment.resources.branch,
          expectedDirectorPlayerId: "CB01",
          ...payload,
        }),
      });
      const body = await response.json().catch(() => ({
        ok: false,
        code: "STEP11_6_GOOGLE_WRITER_FENCE_RESPONSE_INVALID",
      }));
      if (!response.ok || body.ok !== true) {
        setError(body);
        if (body?.diagnostics?.fenceId || body?.diagnostics?.installRequestId) {
          retain({
            fenceId: body.diagnostics.fenceId || recovery.fenceId || "",
            installRequestId: body.diagnostics.installRequestId ||
              recovery.installRequestId || "",
          });
        }
        return null;
      }
      setResult(body);
      return body;
    } catch {
      setError({
        code: "STEP11_6_GOOGLE_WRITER_FENCE_RESPONSE_UNKNOWN",
        error: "The response was not received. The retained request identity can inspect the durable result.",
      });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function inspectProvider() {
    const body = await post("inspect-drive-acl-rehearsal", {
      installRequestId: recovery.installRequestId || "",
      fenceId: recovery.fenceId || "",
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
    }, requestId());
    if (body?.inspection) retain({
      baseline: body.inspection.baselineMetadataFingerprint,
      noSheetsTransportSentinel:
        body.inspection.noSheetsTransportSentinelFingerprint,
      criticalWafEpochId: body.controlReceipt?.criticalWafEpochId ||
        recovery.criticalWafEpochId || "",
      legacyDriveRole: body.inspection.drivePermissionAudit?.legacyIdentityRole ||
        body.inspection.driveAcl?.legacyRole || body.inspection.legacyRole || "UNKNOWN",
      fenceId: body.controlReceipt?.fenceId || recovery.fenceId || "",
      installRequestId: body.controlReceipt?.installRequestId ||
        recovery.installRequestId || "",
    });
  }

  function retainWafEpoch(epochInput) {
    const epoch = epochInput && typeof epochInput === "object" ? epochInput : {};
    const nextEpoch = { ...(recovery.criticalWafEpoch || {}), ...epoch };
    const nextRuleId = epoch.providerAssignedRuleId || routingRuleId.trim();
    const nextRuleRevision = epoch.criticalActiveConfigurationVersion ||
      routingRuleRevision.trim();
    if (nextRuleId) setRoutingRuleId(nextRuleId);
    if (nextRuleRevision) setRoutingRuleRevision(nextRuleRevision);
    retain({
      criticalWafEpoch: nextEpoch,
      criticalWafEpochId: epoch.epochId || criticalWafEpochId,
      criticalWafStatus: epoch.status || criticalWafStatus,
      criticalActiveObservationId: epoch.criticalActiveObservationId ||
        recovery.criticalActiveObservationId || "",
      latestCriticalReattestObservationId:
        epoch.latestCriticalReattestObservationId ||
        recovery.latestCriticalReattestObservationId || "",
      routingRuleId: nextRuleId,
      routingRuleRevision: nextRuleRevision,
    });
  }

  async function executeWafProvider(action, requestKey, { includeFence = false } = {}) {
    const epochId = criticalWafEpochId || requestId();
    const operationRequestId = recovery[requestKey] || requestId();
    retain({
      criticalWafEpochId: epochId,
      [requestKey]: operationRequestId,
    });
    const body = await post(action, {
      criticalWafEpochId: epochId,
      ...(includeFence ? { fenceId: recovery.fenceId || "" } : {}),
    }, operationRequestId);
    if (body?.wafEpoch) retainWafEpoch(body.wafEpoch);
  }

  function currentCriticalWafBinding() {
    if (!criticalWafEpochId || !criticalWafObservationId ||
        !new Set(["INSTALL", "RESTORE_REATTEST"]).has(
          criticalWafQuiesceStage,
        )) {
      throw Object.assign(new Error(
        "The exact active critical-WAF observation is required.",
      ), { code: "STEP11_6_WRITER_QUIESCE_CRITICAL_WAF_BINDING_REQUIRED" });
    }
    return {
      criticalWafEpochId,
      criticalWafObservationId,
      criticalWafQuiesceStage,
    };
  }

  async function beginQuiesce() {
    let stable;
    let payload;
    try {
      stable = ensureProviderAttestationStageState(recovery, "BEGIN", requestId);
      payload = buildProviderQuiesceStagePayload(stable, "BEGIN", {
        purpose: "REHEARSAL",
        routingRule: routingRule(),
        priorEvidenceId: recovery.priorEvidenceIdForCycle || "",
      });
      payload = { ...payload, ...currentCriticalWafBinding() };
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_REQUIRED");
      return;
    }
    retain({
      quiesceStatus: "PROBING",
      quiesceCriticalWafStage: criticalWafQuiesceStage,
      quiesceCriticalWafObservationId: criticalWafObservationId,
      routingRuleId: routingRuleId.trim(),
      routingRuleRevision: routingRuleRevision.trim(),
    });
    const body = await post("begin-provider-quiesce", {
      ...payload,
      ownerOverrideOperationallyFrozen: ownerFreezeConfirmed,
      ownerFreezeConfirmation: OWNER_FREEZE_CONFIRMATION,
      ownerFreezeTtlSeconds: 2100,
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
    }, stable.beginOperationRequestId);
    if (body?.quiesce) retain({
      quiesceEvidenceId: body.quiesce.evidenceId,
      evidenceRequestId: body.quiesce.evidenceRequestId,
      quiesceStatus: body.quiesce.status,
      drainStartedAt: body.quiesce.drainStartedAt,
      quiesceCriticalWafStage: criticalWafQuiesceStage,
      quiesceCriticalWafObservationId: criticalWafObservationId,
    });
  }

  async function finalizeQuiesce() {
    let stable;
    let payload;
    try {
      stable = ensureProviderAttestationStageState(recovery, "FINALIZE", requestId);
      payload = buildProviderQuiesceStagePayload(stable, "FINALIZE", {
        purpose: "REHEARSAL",
        routingRule: routingRule(),
        quiesceEvidenceId: recovery.quiesceEvidenceId || "",
      });
      payload = { ...payload, ...currentCriticalWafBinding() };
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_REQUIRED");
      return;
    }
    const body = await post("finalize-provider-quiesce", {
      ...payload,
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
    }, stable.finalizeOperationRequestId);
    if (body?.quiesce) retain({
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceStatus: body.quiesce.status,
      quiesceExpiresAt: body.quiesce.expiresAt,
      quiesceRefreshPending: false,
      quiesceCriticalWafStage: criticalWafQuiesceStage,
      quiesceCriticalWafObservationId: criticalWafObservationId,
    });
  }

  async function inspectQuiesce() {
    const body = await post("inspect-provider-quiesce", {
      quiescePurpose: "REHEARSAL",
      quiesceEvidenceId: recovery.quiesceEvidenceId || "",
      evidenceRequestId: recovery.evidenceRequestId || "",
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
    }, requestId());
    if (body?.quiesce) retain({
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceStatus: body.quiesce.status,
      quiesceExpiresAt: body.quiesce.expiresAt,
    });
  }

  async function downgradeDriveAcl() {
    const installRequestId = recovery.installRequestId || requestId();
    retain({ installRequestId });
    const body = await post("downgrade-drive-acl-rehearsal", {
      quiesceEvidenceId: recovery.quiesceEvidenceId || "",
      criticalWafEpochId,
      expectedBaselineFingerprint: baseline,
      expectedCanonicalValueFingerprint: noSheetsTransportSentinel,
      confirmation: DRIVE_ACL_DOWNGRADE_CONFIRMATION,
    }, installRequestId);
    if (body) retain({
      fenceId: body.controlReceipt?.fenceId || recovery.fenceId || "",
      installRequestId: body.controlReceipt?.installRequestId || installRequestId,
      criticalWafEpochId: body.controlReceipt?.criticalWafEpochId ||
        criticalWafEpochId,
      legacyDriveRole: body.inspection?.drivePermissionAudit?.legacyIdentityRole ||
        body.inspection?.driveAcl?.legacyRole || body.inspection?.legacyRole ||
        recovery.legacyDriveRole || "UNKNOWN",
      aclDowngradeStatus: body.controlReceipt?.status || "",
      settlementStage: body.settlementStage ||
        body.controlReceipt?.providerSettlementStage || "",
      settlementRemainingWaitSeconds: Number(
        body.settlementRemainingWaitSeconds ??
        body.controlReceipt?.providerSettlementRemainingWaitSeconds ?? 0,
      ),
    });
  }

  async function restoreDriveAcl() {
    const restoreRequestId = recovery.restoreRequestId || requestId();
    retain({ restoreRequestId });
    const body = await post("restore-drive-acl-rehearsal", {
      installRequestId: recovery.installRequestId || "",
      fenceId: recovery.fenceId || "",
      quiesceEvidenceId: recovery.quiesceEvidenceId || "",
      expectedBaselineFingerprint: baseline,
      expectedCanonicalValueFingerprint: noSheetsTransportSentinel,
      confirmation: DRIVE_ACL_RESTORE_CONFIRMATION,
    }, restoreRequestId);
    if (body) retain({
      legacyDriveRole: body.inspection?.drivePermissionAudit?.legacyIdentityRole ||
        body.inspection?.driveAcl?.legacyRole || body.inspection?.legacyRole ||
        recovery.legacyDriveRole || "UNKNOWN",
      aclDowngradeStatus: body.controlReceipt?.status ||
        recovery.aclDowngradeStatus || "",
      aclRestoreConfirmed: body.aclRestoredWafActive === true ||
        body.controlReceipt?.status === "ACL_RESTORED_WAF_ACTIVE",
    });
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <p className={styles.eyebrow}>STEP 11.6 · CONTROLLED PROVIDER REHEARSAL</p>
      <h1>Production Google writer fence</h1>
      <p>
        This tool uses a durable, server-verified Vercel edge quiesce before temporarily
        downgrading the exact legacy Google service account from Drive writer to reader.
        It changes only that exact permission and never writes cells, scores, or lifecycle facts.
      </p>
      <dl className={styles.facts}>
        <div><dt>Candidate SHA</dt><dd>{environment.resources.commitSha}</dd></div>
        <div><dt>Workbook</dt><dd>{environment.resources.workbookId}</dd></div>
        <div><dt>Branch</dt><dd>{environment.resources.branch}</dd></div>
        <div><dt>Director</dt><dd>CB01 · 2026</dd></div>
        <div><dt>Quiesce</dt><dd>{recovery.quiesceStatus || "NOT STARTED"}</dd></div>
        <div><dt>Critical WAF epoch</dt><dd>{criticalWafEpoch.status || "NOT STARTED"}</dd></div>
        <div><dt>WAF dispatch</dt><dd>{criticalWafEpoch.activeDispatchStatus || "NONE"}</dd></div>
        <div><dt>Unknown WAF outcomes</dt><dd>{Number(
          criticalWafEpoch.unknownDispatchCount || 0,
        )}</dd></div>
        <div><dt>Legacy Drive role</dt><dd>{legacyDriveRole}</dd></div>
        <div><dt>ACL settlement</dt><dd>{recovery.settlementStage || "NOT STARTED"}</dd></div>
        <div><dt>Settlement wait</dt><dd>{Number(
          recovery.settlementRemainingWaitSeconds || 0,
        )} seconds</dd></div>
      </dl>
      <div className={styles.warning}>
        One durable WAF epoch captures BASELINE, stages and activates the exact temporary
        five-group CRITICAL_WINDOW rule, binds one ACL fence, and later proves
        BASELINE_RESTORED. Provider mutations are one-shot dispatches. OUTCOME_UNKNOWN is
        inspect-only and must never be retried. The legacy Drive permission must
        remain reader and that WAF must remain active for at least 1,810 seconds from the
        signed provider activation time before restoration. ACL restoration first enters
        ACL_RESTORED_WAF_ACTIVE; that is not PASS until the same WAF epoch reaches
        BASELINE_RESTORED. The server separately
        enforces the 190-second plus 10-second ACL readbacks. Request identities are
        retained so a lost response can be inspected, but an OUTCOME_UNKNOWN Drive result must
        never be retried. Download each challenge, sign it with the Keychain attester,
        then load the resulting envelope here. The browser never verifies an attestation.
      </div>
      <fieldset className={styles.evidence} disabled={Boolean(busy)}>
        <legend>Temporary CRITICAL_WINDOW WAF and rehearsal owner freeze</legend>
        <label>
          Vercel rule ID
          <input value={routingRuleId}
            onChange={(event) => setRoutingRuleId(event.target.value)}
            spellCheck="false" autoComplete="off" />
        </label>
        <label>
          Vercel rule revision
          <input value={routingRuleRevision}
            onChange={(event) => setRoutingRuleRevision(event.target.value)}
            spellCheck="false" autoComplete="off" />
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={ownerFreezeConfirmed}
            onChange={(event) => setOwnerFreezeConfirmed(event.target.checked)} />
          I confirm the Google workbook owner will not write during this bounded rehearsal.
        </label>
      </fieldset>
      <div className={styles.actions}>
        <button type="button" disabled={Boolean(busy)} onClick={inspectProvider}>
          {busy === "inspect-drive-acl-rehearsal" ? "Inspecting…" : "Inspect Drive ACL"}
        </button>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          !baseline || wafInstallComplete}
          onClick={() => executeWafProvider(
            "install-vercel-waf-provider-fence", "wafInstallRequestId",
          )}>
          {busy === "install-vercel-waf-provider-fence"
            ? "Installing temporary WAF…" : "Install temporary CRITICAL_WINDOW WAF"}
        </button>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          !routingRuleId.trim() || !routingRuleRevision.trim()}
          onClick={() => issueChallenge("BEGIN")}>
          {busy === "issue-provider-attestation-challenge"
            ? "Issuing challenge…" : "Issue / recover BEGIN or refresh challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !recovery.beginProviderChallenge || Boolean(verifiedQuiesce)}
          onClick={() => inspectRetainedChallenge("BEGIN")}>
          {busy === "inspect-retained-provider-attestation-challenge"
            ? "Inspecting retained challenge…" : "Inspect retained BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) || !beginAbandonable}
          onClick={() => abandonRetainedChallenge("BEGIN")}>
          {busy === "abandon-provider-attestation-challenge"
            ? "Abandoning retained challenge…" :
              "Abandon stale unbound BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !recovery.beginProviderAttestationRequest}
          onClick={() => downloadAttesterRequest("BEGIN")}>
          Download BEGIN attester request
        </button>
        <label>
          Load signed BEGIN envelope
          <input type="file" accept="application/json,.json" disabled={Boolean(busy) ||
            !recovery.beginProviderChallenge}
            onChange={(event) => loadSignedAttestation("BEGIN", event)} />
        </label>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          !beginExecutable}
          onClick={beginQuiesce}>
          {busy === "begin-provider-quiesce" ? "Probing origins…" : "Begin critical window"}
        </button>
        <button type="button" disabled={Boolean(busy) || !recovery.quiesceEvidenceId ||
          recovery.quiesceStatus !== "DRAINING"}
          onClick={() => issueChallenge("FINALIZE")}>
          {busy === "issue-provider-attestation-challenge"
            ? "Issuing challenge…" : "Issue / recover FINALIZE challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !recovery.finalizeProviderChallenge}
          onClick={() => inspectRetainedChallenge("FINALIZE")}>
          {busy === "inspect-retained-provider-attestation-challenge"
            ? "Inspecting retained challenge…" : "Inspect retained FINALIZE challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) || !finalizeAbandonable}
          onClick={() => abandonRetainedChallenge("FINALIZE")}>
          {busy === "abandon-provider-attestation-challenge"
            ? "Abandoning retained challenge…" :
              "Abandon stale unbound FINALIZE challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !recovery.finalizeProviderAttestationRequest}
          onClick={() => downloadAttesterRequest("FINALIZE")}>
          Download FINALIZE attester request
        </button>
        <label>
          Load signed FINALIZE envelope
          <input type="file" accept="application/json,.json" disabled={Boolean(busy) ||
            !recovery.finalizeProviderChallenge}
            onChange={(event) => loadSignedAttestation("FINALIZE", event)} />
        </label>
        <button type="button" disabled={Boolean(busy) || !recovery.quiesceEvidenceId ||
          !finalizeExecutable}
          onClick={finalizeQuiesce}>
          {busy === "finalize-provider-quiesce" ? "Re-probing origins…" : "Finalize quiesce"}
        </button>
        <button type="button" disabled={Boolean(busy) || !recovery.evidenceRequestId}
          onClick={inspectQuiesce}>
          {busy === "inspect-provider-quiesce" ? "Inspecting…" : "Inspect quiesce receipt"}
        </button>
        <button type="button" className={styles.primary}
          disabled={Boolean(busy) || !baseline || !noSheetsTransportSentinel ||
            !criticalWafEpochId || !verifiedQuiesce ||
            recovery.quiesceCriticalWafStage !== "INSTALL" ||
            (legacyDriveRole === "reader" && aclSettlementComplete)}
          onClick={downgradeDriveAcl}>
          {busy === "downgrade-drive-acl-rehearsal"
            ? "Recording Drive ACL settlement…"
            : legacyDriveRole === "reader"
              ? `Continue ACL settlement (${Number(
                recovery.settlementRemainingWaitSeconds || 0,
              )}s remaining)`
              : "Downgrade legacy Drive writer to reader"}
        </button>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          !criticalWafEpochId || legacyDriveRole !== "reader" ||
          !aclSettlementComplete || wafReattestationComplete}
          onClick={() => executeWafProvider(
            "reattest-vercel-waf-provider-fence", "wafReattestRequestId",
          )}>
          {busy === "reattest-vercel-waf-provider-fence"
            ? "Reattesting temporary WAF…" : "Reattest CRITICAL_WINDOW WAF"}
        </button>
        <button type="button" className={styles.restore}
          disabled={Boolean(busy) || !baseline || !noSheetsTransportSentinel ||
            !recovery.installRequestId || !recovery.fenceId ||
            legacyDriveRole !== "reader" || !wafReattestationComplete ||
            !verifiedQuiesce ||
            recovery.quiesceCriticalWafStage !== "RESTORE_REATTEST"}
          onClick={restoreDriveAcl}>
          {busy === "restore-drive-acl-rehearsal"
            ? "Restoring Drive permission…"
            : "Restore legacy Drive writer permission after 1,810-second hold"}
        </button>
        <button type="button" className={styles.restore}
          disabled={Boolean(busy) || !criticalWafEpochId || !recovery.fenceId ||
            legacyDriveRole !== "writer" || recovery.aclRestoreConfirmed !== true ||
            wafBaselineRestored}
          onClick={() => executeWafProvider(
            "restore-vercel-waf-provider-baseline", "wafRestoreRequestId",
            { includeFence: true },
          )}>
          {busy === "restore-vercel-waf-provider-baseline"
            ? "Restoring Vercel WAF baseline…" : "Restore exact Vercel WAF baseline"}
        </button>
      </div>
      {error ? <section className={styles.error} aria-live="assertive">
        <strong>{error.code || "Operation stopped"}</strong>
        <p>{error.error || "The operation failed closed."}</p>
        {error.diagnostics?.restoreRequired === true
          ? <p>Recovery state: exact legacy Drive writer restoration is still required.</p> : null}
        {error.diagnostics && Object.keys(error.diagnostics).length > 0
          ? <details>
            <summary>Safe diagnostics</summary>
            <pre>{JSON.stringify(error.diagnostics, null, 2)}</pre>
          </details> : null}
      </section> : null}
      {result ? <section className={styles.result} aria-live="polite">
        <h2>Sanitized authoritative result</h2>
        <details open>
          <summary>Evidence</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      </section> : null}
    </section>
  </main>;
}
