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
import styles from "../step11-6-production-google-writer-fence/writer-fence.module.css";

const API_PATH = "/api/admin/step11-6-production-google-writer-fence";
const STORAGE_KEY = "bagger.step12.provider-writer-fence.recovery.v1";
const INSTALL_CONFIRMATION = "STEP12_GOOGLE_WRITER_PROVIDER_FENCE";
const ABORT_INSTALL_CONFIRMATION =
  "ABORT_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL";
const REMOVE_CONFIRMATION = "REMOVE_STEP12_GOOGLE_WRITER_PROVIDER_FENCE";
const OWNER_CONFIRMATION =
  "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER";

const newId = () => {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new Error("Secure browser request identities are unavailable.");
  return value;
};

function readRetained() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}

export default function PersistentWriterFenceClient({ environment }) {
  const [state, setState] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState("");
  const [ownerFreezeConfirmed, setOwnerFreezeConfirmed] = useState(false);
  const [routingRuleId, setRoutingRuleId] = useState("");
  const [routingRuleRevision, setRoutingRuleRevision] = useState("");
  const baseline = result?.inspection?.baselineMetadataFingerprint || state.baseline || "";
  const noSheetsTransportSentinel =
    result?.inspection?.noSheetsTransportSentinelFingerprint ||
    state.noSheetsTransportSentinel || "";
  const criticalWafEpoch = result?.criticalWafEpoch ||
    result?.inspection?.criticalWafEpoch || state.criticalWafEpoch || {};
  const criticalWafEpochId = result?.controlReceipt?.criticalWafEpochId ||
    state.criticalWafEpochId || criticalWafEpoch.epochId || "";
  const beginExecutable = canExecuteProviderQuiesceStage(state, "BEGIN");
  const finalizeExecutable = canExecuteProviderQuiesceStage(state, "FINALIZE");
  const beginAbandonable = canAbandonRetainedProviderAttestationChallenge(
    state,
    state.beginProviderChallengeAbandonmentInspection ||
      state.retainedProviderChallengeInspection,
    "CUTOVER",
    "BEGIN",
  );
  const finalizeAbandonable = canAbandonRetainedProviderAttestationChallenge(
    state,
    state.finalizeProviderChallengeAbandonmentInspection,
    "CUTOVER",
    "FINALIZE",
  );

  useEffect(() => {
    const retained = readRetained();
    setState(retained);
    setRoutingRuleId(retained.routingRuleId || "");
    setRoutingRuleRevision(retained.routingRuleRevision || "");
  }, []);

  function retain(change) {
    setState((current) => {
      const next = { ...current, ...change };
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function rule() {
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

  function clientError(cause, fallbackCode) {
    setError({
      code: cause?.code || fallbackCode,
      error: cause?.message || "The local provider-attestation contract failed closed.",
    });
  }

  function storeExact(next) {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }

  async function inspectRetainedChallenge(stage) {
    const keys = providerAttestationStageKeys(stage);
    let payload;
    try {
      payload = buildRetainedProviderAttestationChallengePayload(
        state, "CUTOVER", keys.stage,
      );
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID");
      return;
    }
    const body = await post(
      "inspect-retained-provider-attestation-challenge",
      state[keys.operationKey],
      payload,
    );
    if (!body?.challenge) return;
    try {
      const inspection = validateRetainedProviderAttestationChallenge(
        body.challenge, state, "CUTOVER", keys.stage,
      );
      retain({
        [keys.abandonmentInspectionKey]: inspection,
        ...(inspection.status === "CONSUMED"
          ? { [keys.challengeKey]: inspection }
          : {}),
      });
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID");
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
      const abandonRequestId = state[keys.abandonRequestKey] || newId();
      stable = { ...state, [keys.abandonRequestKey]: abandonRequestId };
      payload = buildRetainedProviderAttestationChallengePayload(
        stable, "CUTOVER", keys.stage,
      );
      storeExact(stable);
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_ABANDON_REQUEST_INVALID");
      return;
    }
    const body = await post(
      "abandon-provider-attestation-challenge",
      stable[keys.operationKey],
      { ...payload, abandonRequestId: stable[keys.abandonRequestKey] },
    );
    if (!body?.challenge) return;
    try {
      storeExact(discardAbandonedProviderAttestationAttempt(
        stable, body.challenge, "CUTOVER", keys.stage,
      ));
      if (keys.stage === "BEGIN") setOwnerFreezeConfirmed(false);
      setError(null);
      setResult(body);
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_ABANDON_RECEIPT_INVALID");
    }
  }

  async function issueChallenge(stage) {
    const keys = providerAttestationStageKeys(stage);
    let stable;
    try {
      let cycle = state;
      if (keys.stage === "BEGIN" && state.quiesceStatus === "VERIFIED" &&
          state.quiesceEvidenceId && state.quiesceRefreshPending !== true) {
        cycle = {
          ...state,
          quiesceRefreshPending: true,
          priorEvidenceIdForCycle: state.quiesceEvidenceId,
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
      stable = ensureProviderAttestationStageState(cycle, stage, newId);
      storeExact(stable);
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_REQUEST_ID_INVALID");
      return;
    }
    const body = await post(
      "issue-provider-attestation-challenge",
      stable[keys.operationKey],
      {
        quiescePurpose: "CUTOVER",
        evidenceRequestId: stable.evidenceRequestId,
        challengeRequestId: stable[keys.challengeRequestKey],
        providerAttestationStage: keys.stage,
        routingRule: rule(),
        expectedBaselineFingerprint: "",
        expectedCanonicalValueFingerprint: "",
      },
    );
    if (!body?.challenge || !body?.providerAttestationRequest) return;
    try {
      const challenge = validateProviderAttestationChallenge(
        body.challenge, stable, keys.stage, "CUTOVER",
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
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_CHALLENGE_INVALID");
    }
  }

  function downloadAttesterRequest(stage) {
    const keys = providerAttestationStageKeys(stage);
    const request = state[keys.attesterRequestKey];
    if (!request) {
      clientError(null, "STEP12_PROVIDER_ATTESTATION_REQUEST_REQUIRED");
      return;
    }
    const blob = new Blob([`${JSON.stringify({ providerAttestationRequest: request }, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `step12-${keys.prefix}-provider-attestation-request.json`;
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
        state[keys.challengeKey], state, keys.stage, "CUTOVER",
      );
      const validated = validateLoadedProviderAttestationEnvelope(envelope, challenge);
      retain({ [keys.envelopeKey]: validated });
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_FILE_INVALID");
    }
  }

  async function post(action, operationRequestId, extra = {}) {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(API_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          operationRequestId,
          expectedCommitSha: environment.resources.commitSha,
          expectedWorkbookId: environment.resources.workbookId,
          expectedBranch: environment.resources.branch,
          expectedDirectorPlayerId: "CB01",
          ...extra,
        }),
      });
      const body = await response.json().catch(() => ({
        ok: false,
        code: "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_RESPONSE_INVALID",
      }));
      if (!response.ok || body.ok !== true) {
        setError(body);
        return null;
      }
      setResult(body);
      const receipt = body.controlReceipt || {};
      if (receipt.fenceId || receipt.installRequestId) retain({
        fenceId: receipt.fenceId || state.fenceId || "",
        installRequestId: receipt.installRequestId || state.installRequestId || "",
        abortRequestId: receipt.abortRequestId || state.abortRequestId || "",
        currentVerificationId: receipt.activeVerificationId ||
          receipt.verification?.verificationId || state.currentVerificationId || "",
        fenceStatus: receipt.status || "",
        settlementStage: receipt.providerSettlementStage ||
          state.settlementStage || "",
        settlementNextEligibleAt: receipt.providerSettlementNextEligibleAt || null,
        settlementRemainingWaitSeconds: Number(
          receipt.providerSettlementRemainingWaitSeconds ??
            state.settlementRemainingWaitSeconds ?? 0,
        ),
        admissionState: receipt.admissionState || state.admissionState || "",
        criticalWafEpochId: receipt.criticalWafEpochId ||
          state.criticalWafEpochId || "",
      });
      return body;
    } catch {
      setError({
        code: "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_RESPONSE_UNKNOWN",
        error: "The response was lost. Inspect with the retained request identity before retrying.",
      });
      return null;
    } finally { setBusy(""); }
  }

  async function inspectFence() {
    const body = await post("inspect-persistent-provider-fence", newId(), {
      installRequestId: state.installRequestId || "",
      fenceId: state.fenceId || "",
      currentVerificationId: state.currentVerificationId || "",
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
    });
    if (body?.inspection) retain({
      baseline: body.inspection.baselineMetadataFingerprint,
      noSheetsTransportSentinel:
        body.inspection.noSheetsTransportSentinelFingerprint,
    });
  }

  async function beginQuiesce() {
    let stable;
    let payload;
    try {
      stable = ensureProviderAttestationStageState(state, "BEGIN", newId);
      payload = buildProviderQuiesceStagePayload(stable, "BEGIN", {
        purpose: "CUTOVER",
        routingRule: rule(),
        priorEvidenceId: state.priorEvidenceIdForCycle || "",
      });
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_REQUIRED");
      return;
    }
    retain({
      quiesceStatus: "PROBING",
      routingRuleId: routingRuleId.trim(),
      routingRuleRevision: routingRuleRevision.trim(),
    });
    const body = await post("begin-provider-quiesce", stable.beginOperationRequestId, {
      ...payload,
      ownerOverrideOperationallyFrozen: ownerFreezeConfirmed,
      ownerFreezeConfirmation: OWNER_CONFIRMATION,
      ownerFreezeTtlSeconds: 2100,
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
    });
    if (body?.quiesce) retain({
      evidenceRequestId: body.quiesce.evidenceRequestId,
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceStatus: body.quiesce.status,
    });
  }

  async function finalizeQuiesce() {
    let stable;
    let payload;
    try {
      stable = ensureProviderAttestationStageState(state, "FINALIZE", newId);
      payload = buildProviderQuiesceStagePayload(stable, "FINALIZE", {
        purpose: "CUTOVER",
        routingRule: rule(),
        quiesceEvidenceId: state.quiesceEvidenceId || "",
      });
    } catch (cause) {
      clientError(cause, "STEP12_PROVIDER_ATTESTATION_REQUIRED");
      return;
    }
    const body = await post(
      "finalize-provider-quiesce",
      stable.finalizeOperationRequestId,
      {
        ...payload,
        expectedBaselineFingerprint: "",
        expectedCanonicalValueFingerprint: "",
      },
    );
    if (body?.quiesce) retain({
      quiesceStatus: body.quiesce.status,
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceExpiresAt: body.quiesce.expiresAt,
      quiesceRefreshPending: false,
    });
  }

  async function inspectQuiesce() {
    const body = await post("inspect-provider-quiesce", newId(), {
      quiescePurpose: "CUTOVER",
      evidenceRequestId: state.evidenceRequestId || "",
      quiesceEvidenceId: state.quiesceEvidenceId || "",
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
    });
    if (body?.quiesce) retain({
      quiesceStatus: body.quiesce.status,
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceExpiresAt: body.quiesce.expiresAt,
    });
  }

  async function installFence() {
    const installRequestId = state.installRequestId || newId();
    retain({ installRequestId });
    await post("install-persistent-provider-fence", installRequestId, {
      quiesceEvidenceId: state.quiesceEvidenceId || "",
      criticalWafEpochId,
      expectedBaselineFingerprint: baseline,
      expectedCanonicalValueFingerprint: noSheetsTransportSentinel,
      confirmation: INSTALL_CONFIRMATION,
    });
  }

  async function refreshFence() {
    const refreshRequestId = state.refreshRequestId || newId();
    retain({ refreshRequestId });
    const body = await post("refresh-persistent-provider-fence", refreshRequestId, {
      installRequestId: state.installRequestId || "",
      fenceId: state.fenceId || "",
      currentVerificationId: state.currentVerificationId || "",
      quiesceEvidenceId: state.quiesceEvidenceId || "",
    });
    if (body) retain({ refreshRequestId: "" });
  }

  async function abortFenceInstall() {
    const abortRequestId = state.abortRequestId || newId();
    retain({ abortRequestId });
    await post("abort-persistent-provider-fence-install", abortRequestId, {
      installRequestId: state.installRequestId || "",
      fenceId: state.fenceId || "",
      quiesceEvidenceId: state.quiesceEvidenceId || "",
      expectedBaselineFingerprint: baseline,
      expectedCanonicalValueFingerprint: noSheetsTransportSentinel,
      confirmation: ABORT_INSTALL_CONFIRMATION,
    });
  }

  async function removeFence() {
    const removalRequestId = state.removalRequestId || newId();
    retain({ removalRequestId });
    await post("remove-persistent-provider-fence", removalRequestId, {
      installRequestId: state.installRequestId || "",
      fenceId: state.fenceId || "",
      currentVerificationId: state.currentVerificationId || "",
      quiesceEvidenceId: state.quiesceEvidenceId || "",
      confirmation: REMOVE_CONFIRMATION,
    });
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <p className={styles.eyebrow}>STEP 12 · PERSISTENT PROVIDER FENCE</p>
      <h1>Production Google writer fence</h1>
      <p>
        This Step-12-only control binds one signed critical-WAF epoch to the exact
        legacy Drive permission at reader through close, prepare, and commit. Google
        writer restoration is impossible until the Production control plane authorizes
        a proven safe rollback or abort.
      </p>
      <dl className={styles.facts}>
        <div><dt>Candidate SHA</dt><dd>{environment.resources.commitSha}</dd></div>
        <div><dt>Workbook</dt><dd>{environment.resources.workbookId}</dd></div>
        <div><dt>Quiesce</dt><dd>{state.quiesceStatus || "NOT STARTED"}</dd></div>
        <div><dt>Fence</dt><dd>{state.fenceStatus || "NOT INSTALLED"}</dd></div>
        <div><dt>Critical WAF epoch</dt><dd>{criticalWafEpoch.status || "NOT STARTED"}</dd></div>
        <div><dt>WAF dispatch</dt><dd>{criticalWafEpoch.activeDispatchStatus || "NONE"}</dd></div>
        <div><dt>Unknown WAF outcomes</dt><dd>{Number(
          criticalWafEpoch.unknownDispatchCount || 0,
        )}</dd></div>
        <div><dt>Settlement</dt><dd>{state.settlementStage || "NOT STARTED"}</dd></div>
        <div><dt>Wait remaining</dt><dd>{Number(
          state.settlementRemainingWaitSeconds || 0,
        )} seconds</dd></div>
        <div><dt>Legacy admission</dt><dd>{state.admissionState || "OPEN"}</dd></div>
      </dl>
      <div className={styles.warning}>
        Active operations are unavailable unless the separate Step 12 enable flag and
        exact frozen SHA both match. A lost response never authorizes deletion: inspect
        discovers the durable quiesce/fence record by its retained request identity.
        Every WAF provider mutation is reserve → mark-started → result. An
        OUTCOME_UNKNOWN dispatch is terminal and inspection-only. Baseline restoration
        uses the same FENCE_BOUND epoch and never restores the Google ACL after a
        successful Supabase commit.
        Each quiesce stage uses a database-issued challenge downloaded for the local
        Keychain attester. Load the signed envelope before the stage can execute; the
        browser never creates an attestation.
      </div>
      <fieldset className={styles.evidence} disabled={Boolean(busy)}>
        <legend>Permanent Vercel rule and owner freeze</legend>
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
          I confirm the Google workbook owner will not write during this cutover window.
        </label>
      </fieldset>
      <div className={styles.actions}>
        <button type="button" disabled={Boolean(busy)} onClick={inspectFence}>
          {busy === "inspect-persistent-provider-fence" ? "Inspecting…" : "Inspect provider fence"}
        </button>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          !routingRuleId.trim() || !routingRuleRevision.trim()}
          onClick={() => issueChallenge("BEGIN")}>
          {busy === "issue-provider-attestation-challenge"
            ? "Issuing challenge…" : "Issue / recover BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !state.beginProviderChallenge}
          onClick={() => inspectRetainedChallenge("BEGIN")}>
          {busy === "inspect-retained-provider-attestation-challenge"
            ? "Inspecting retained challenge…" : "Inspect retained BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) || !beginAbandonable}
          onClick={() => abandonRetainedChallenge("BEGIN")}>
          {busy === "abandon-provider-attestation-challenge"
            ? "Abandoning retained challenge…" : "Abandon stale unbound BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !state.beginProviderAttestationRequest}
          onClick={() => downloadAttesterRequest("BEGIN")}>
          Download BEGIN attester request
        </button>
        <label>
          Load signed BEGIN envelope
          <input type="file" accept="application/json,.json" disabled={Boolean(busy) ||
            !state.beginProviderChallenge}
            onChange={(event) => loadSignedAttestation("BEGIN", event)} />
        </label>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          !beginExecutable}
          onClick={beginQuiesce}>
          {busy === "begin-provider-quiesce" ? "Probing…" : "Begin / refresh quiesce"}
        </button>
        <button type="button" disabled={Boolean(busy) || !state.quiesceEvidenceId ||
          state.quiesceStatus !== "DRAINING"}
          onClick={() => issueChallenge("FINALIZE")}>
          {busy === "issue-provider-attestation-challenge"
            ? "Issuing challenge…" : "Issue / recover FINALIZE challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !state.finalizeProviderChallenge}
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
          !state.finalizeProviderAttestationRequest}
          onClick={() => downloadAttesterRequest("FINALIZE")}>
          Download FINALIZE attester request
        </button>
        <label>
          Load signed FINALIZE envelope
          <input type="file" accept="application/json,.json" disabled={Boolean(busy) ||
            !state.finalizeProviderChallenge}
            onChange={(event) => loadSignedAttestation("FINALIZE", event)} />
        </label>
        <button type="button" disabled={Boolean(busy) || !state.quiesceEvidenceId ||
          !finalizeExecutable}
          onClick={finalizeQuiesce}>
          {busy === "finalize-provider-quiesce" ? "Re-probing…" : "Finalize quiesce"}
        </button>
        <button type="button" disabled={Boolean(busy) || !state.evidenceRequestId}
          onClick={inspectQuiesce}>Inspect quiesce receipt</button>
        <button type="button" className={styles.primary}
          disabled={Boolean(busy) || state.quiesceStatus !== "VERIFIED" ||
            !baseline || !noSheetsTransportSentinel || !criticalWafEpochId ||
            state.fenceStatus === "INSTALLED"}
          onClick={installFence}>
          {busy === "install-persistent-provider-fence"
            ? "Verifying…"
            : state.installRequestId
              ? "Continue provider settlement"
              : "Install persistent fence"}
        </button>
        <button type="button" className={styles.restore}
          disabled={Boolean(busy) || !ownerFreezeConfirmed ||
            state.fenceStatus !== "INSTALLING" || !state.installRequestId ||
            !state.fenceId || !state.quiesceEvidenceId || !baseline ||
            !noSheetsTransportSentinel}
          onClick={abortFenceInstall}>
          {busy === "abort-persistent-provider-fence-install"
            ? "Restoring failed install…"
            : state.abortRequestId
              ? "Continue failed-install recovery"
              : "Abort failed install and restore admission"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          state.quiesceStatus !== "VERIFIED" || !state.currentVerificationId}
          onClick={refreshFence}>Refresh fence verification</button>
        <button type="button" className={styles.restore}
          disabled={Boolean(busy) || state.quiesceStatus !== "VERIFIED" ||
            !state.currentVerificationId}
          onClick={removeFence}>
          {busy === "remove-persistent-provider-fence" ? "Authorizing and removing…" : "Authorize safe removal"}
        </button>
      </div>
      {error ? <section className={styles.error} aria-live="assertive">
        <strong>{error.code || "Operation stopped"}</strong>
        <p>{error.error || "The operation failed closed."}</p>
      </section> : null}
      {result ? <section className={styles.result} aria-live="polite">
        <h2>Sanitized authoritative result</h2>
        <details open><summary>Evidence</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
      </section> : null}
    </section>
  </main>;
}
