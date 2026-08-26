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
const FENCE_CONFIRMATION = "STEP11_6_WRITER_FENCE_REHEARSAL";
const OWNER_FREEZE_CONFIRMATION =
  "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL";
const STORAGE_KEY = "bagger.step11-6.writer-fence.recovery.v2";

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
  const canonicalValues = inspection?.canonicalValueFingerprint || recovery.canonicalValues || "";
  const verifiedQuiesce = recovery.quiesceStatus === "VERIFIED" &&
    recovery.quiesceEvidenceId;
  const beginExecutable = canExecuteProviderQuiesceStage(recovery, "BEGIN");
  const finalizeExecutable = canExecuteProviderQuiesceStage(recovery, "FINALIZE");
  const retainedChallengeInspection =
    recovery.retainedProviderChallengeInspection || null;
  const retainedAttemptAbandonable =
    canAbandonRetainedProviderAttestationChallenge(
      recovery,
      retainedChallengeInspection,
      "REHEARSAL",
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
      requestPathOperator: "DOES_NOT_EQUAL",
      requestPath: API_PATH,
      methodOperator: "IS_NOT_ANY_OF",
      methods: ["GET", "HEAD", "OPTIONS"],
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

  async function inspectRetainedChallenge() {
    let payload;
    try {
      payload = buildRetainedProviderAttestationChallengePayload(
        recovery, "REHEARSAL",
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
      recovery.beginOperationRequestId,
    );
    if (!body?.challenge) return;
    try {
      const inspection = validateRetainedProviderAttestationChallenge(
        body.challenge, recovery, "REHEARSAL",
      );
      retain({ retainedProviderChallengeInspection: inspection });
    } catch (cause) {
      clientError(
        cause,
        "STEP11_6_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID",
      );
    }
  }

  async function abandonRetainedChallenge() {
    let stable;
    let payload;
    try {
      if (!retainedAttemptAbandonable) {
        throw Object.assign(new Error(
          "The retained BEGIN challenge is not authoritatively eligible for abandonment.",
        ), { code: "PROVIDER_ATTESTATION_ABANDON_NOT_ELIGIBLE" });
      }
      const beginAbandonRequestId = recovery.beginAbandonRequestId || requestId();
      stable = { ...recovery, beginAbandonRequestId };
      payload = buildRetainedProviderAttestationChallengePayload(
        stable, "REHEARSAL",
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
      { ...payload, abandonRequestId: stable.beginAbandonRequestId },
      stable.beginOperationRequestId,
    );
    if (!body?.challenge) return;
    try {
      const next = discardAbandonedProviderAttestationAttempt(
        stable,
        body.challenge,
        "REHEARSAL",
      );
      storeExact(next);
      setRoutingRuleId("");
      setRoutingRuleRevision("");
      setOwnerFreezeConfirmed(false);
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
      stable = ensureProviderAttestationStageState(recovery, stage, requestId);
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
      rehearsalRunId: "",
      rehearsalRequestId: "",
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
        if (body?.diagnostics?.rehearsalRunId) {
          retain({ rehearsalRunId: body.diagnostics.rehearsalRunId });
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
    const body = await post("inspect", {
      rehearsalRunId: recovery.rehearsalRunId || "",
      rehearsalRequestId: recovery.rehearsalRequestId || "",
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
    }, requestId());
    if (body?.inspection) retain({
      baseline: body.inspection.baselineMetadataFingerprint,
      canonicalValues: body.inspection.canonicalValueFingerprint,
      rehearsalRunId: body.inspection.recoveryRunId || recovery.rehearsalRunId || "",
    });
  }

  async function beginQuiesce() {
    let stable;
    let payload;
    try {
      stable = ensureProviderAttestationStageState(recovery, "BEGIN", requestId);
      payload = buildProviderQuiesceStagePayload(stable, "BEGIN", {
        purpose: "REHEARSAL",
        routingRule: routingRule(),
      });
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_REQUIRED");
      return;
    }
    retain({
      routingRuleId: routingRuleId.trim(),
      routingRuleRevision: routingRuleRevision.trim(),
    });
    const body = await post("begin-provider-quiesce", {
      ...payload,
      ownerOverrideOperationallyFrozen: ownerFreezeConfirmed,
      ownerFreezeConfirmation: OWNER_FREEZE_CONFIRMATION,
      ownerFreezeTtlSeconds: 1800,
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
      rehearsalRunId: "",
      rehearsalRequestId: "",
    }, stable.beginOperationRequestId);
    if (body?.quiesce) retain({
      quiesceEvidenceId: body.quiesce.evidenceId,
      evidenceRequestId: body.quiesce.evidenceRequestId,
      quiesceStatus: body.quiesce.status,
      drainStartedAt: body.quiesce.drainStartedAt,
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
    } catch (cause) {
      clientError(cause, "STEP11_6_PROVIDER_ATTESTATION_REQUIRED");
      return;
    }
    const body = await post("finalize-provider-quiesce", {
      ...payload,
      expectedBaselineFingerprint: "",
      expectedCanonicalValueFingerprint: "",
      confirmation: "",
      rehearsalRunId: "",
      rehearsalRequestId: "",
    }, stable.finalizeOperationRequestId);
    if (body?.quiesce) retain({
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceStatus: body.quiesce.status,
      quiesceExpiresAt: body.quiesce.expiresAt,
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
      rehearsalRunId: "",
      rehearsalRequestId: "",
    }, requestId());
    if (body?.quiesce) retain({
      quiesceEvidenceId: body.quiesce.evidenceId,
      quiesceStatus: body.quiesce.status,
      quiesceExpiresAt: body.quiesce.expiresAt,
    });
  }

  async function rehearse() {
    const rehearsalRequestId = recovery.rehearsalRequestId || requestId();
    retain({ rehearsalRequestId });
    const body = await post("rehearse", {
      quiesceEvidenceId: recovery.quiesceEvidenceId || "",
      rehearsalRunId: "",
      rehearsalRequestId: "",
      expectedBaselineFingerprint: baseline,
      expectedCanonicalValueFingerprint: canonicalValues,
      confirmation: FENCE_CONFIRMATION,
    }, rehearsalRequestId);
    if (body) retain({
      rehearsalRunId: body.controlReceipt?.runId || "",
      rehearsalCertified: body.certificationPassed === true,
    });
  }

  async function restore() {
    const restoreRequestId = recovery.restoreRequestId || requestId();
    retain({ restoreRequestId });
    const body = await post("restore", {
      rehearsalRunId: recovery.rehearsalRunId || "",
      rehearsalRequestId: recovery.rehearsalRequestId || "",
      expectedBaselineFingerprint: baseline,
      expectedCanonicalValueFingerprint: canonicalValues,
      confirmation: FENCE_CONFIRMATION,
    }, restoreRequestId);
    if (body?.baselineRestored === true) retain({ restoreRequestId: "" });
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <p className={styles.eyebrow}>STEP 11.6 · CONTROLLED PROVIDER REHEARSAL</p>
      <h1>Production Google writer fence</h1>
      <p>
        This tool uses a durable, server-verified Vercel edge quiesce before temporarily
        installing the exact rehearsal protections. It never accepts client-entered
        fingerprints or timestamps and never writes cells, scores, or lifecycle facts.
      </p>
      <dl className={styles.facts}>
        <div><dt>Candidate SHA</dt><dd>{environment.resources.commitSha}</dd></div>
        <div><dt>Workbook</dt><dd>{environment.resources.workbookId}</dd></div>
        <div><dt>Branch</dt><dd>{environment.resources.branch}</dd></div>
        <div><dt>Director</dt><dd>CB01 · 2026</dd></div>
        <div><dt>Quiesce</dt><dd>{recovery.quiesceStatus || "NOT STARTED"}</dd></div>
      </dl>
      <div className={styles.warning}>
        Begin quiesce performs a complete first edge probe. Finalize performs a second
        complete probe and the database enforces at least five elapsed minutes with zero
        unresolved writers. Request and run identities are retained in this browser so a
        restart or lost response can be inspected safely. Each stage first issues a
        database challenge. Download it, sign it with the Keychain attester, then load the
        resulting envelope here. The browser never creates or verifies an attestation.
      </div>
      <fieldset className={styles.evidence} disabled={Boolean(busy)}>
        <legend>Temporary Vercel rule and owner freeze</legend>
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
          {busy === "inspect" ? "Inspecting…" : "Inspect workbook"}
        </button>
        <button type="button" disabled={Boolean(busy) || !ownerFreezeConfirmed ||
          recovery.quiesceStatus === "VERIFIED" ||
          !routingRuleId.trim() || !routingRuleRevision.trim()}
          onClick={() => issueChallenge("BEGIN")}>
          {busy === "issue-provider-attestation-challenge"
            ? "Issuing challenge…" : "Issue / recover BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) ||
          !recovery.beginProviderChallenge || Boolean(verifiedQuiesce)}
          onClick={inspectRetainedChallenge}>
          {busy === "inspect-retained-provider-attestation-challenge"
            ? "Inspecting retained challenge…" : "Inspect retained BEGIN challenge"}
        </button>
        <button type="button" disabled={Boolean(busy) || !retainedAttemptAbandonable}
          onClick={abandonRetainedChallenge}>
          {busy === "abandon-provider-attestation-challenge"
            ? "Abandoning retained challenge…" :
              "Abandon expired unconsumed BEGIN challenge"}
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
          {busy === "begin-provider-quiesce" ? "Probing origins…" : "Begin 5-minute quiesce"}
        </button>
        <button type="button" disabled={Boolean(busy) || !recovery.quiesceEvidenceId ||
          recovery.quiesceStatus !== "DRAINING"}
          onClick={() => issueChallenge("FINALIZE")}>
          {busy === "issue-provider-attestation-challenge"
            ? "Issuing challenge…" : "Issue / recover FINALIZE challenge"}
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
          disabled={Boolean(busy) || !baseline || !canonicalValues || !verifiedQuiesce ||
            inspection?.state === "CONFLICT"}
          onClick={rehearse}>
          {busy === "rehearse" ? "Applying and restoring…" : "Apply Rehearsal Fence"}
        </button>
        <button type="button" className={styles.restore}
          disabled={Boolean(busy) || !baseline || !canonicalValues ||
            !recovery.rehearsalRunId || inspection?.state !== "INSTALLED"}
          onClick={restore}>
          {busy === "restore" ? "Restoring…" : "Restore exact rehearsal fence"}
        </button>
      </div>
      {error ? <section className={styles.error} aria-live="assertive">
        <strong>{error.code || "Operation stopped"}</strong>
        <p>{error.error || "The operation failed closed."}</p>
        {error.diagnostics?.restoreRequired === true
          ? <p>Recovery state: exact fence restoration is still required.</p> : null}
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
