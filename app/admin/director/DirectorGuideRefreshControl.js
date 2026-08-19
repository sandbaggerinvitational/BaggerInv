"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { directorFetch } from "../../../lib/director-client-transaction";
import { directorGuideStatusPresentation } from "../../../lib/director-guide-status.js";
import styles from "./DirectorGuideRefreshControl.module.css";

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet available" : date.toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function groupedValidationIssues(issues = []) {
  const groups = new Map();
  for (const issue of issues) {
    const source = String(issue?.source || "Guide validation").trim() || "Guide validation";
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(issue);
  }
  return [...groups].map(([source, items]) => ({ source, items }));
}

function validationIssueLabel(issue = {}) {
  return [issue.entity, issue.field].filter(Boolean).join(" · ");
}

export default function DirectorGuideRefreshControl({ onOperation }) {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [validationIssues, setValidationIssues] = useState([]);
  const requestInFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch("/api/director/guide-content", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Guide status request failed (${response.status}).`);
      setStatus(payload);
      setStatusError("");
      return payload;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Guide refresh status is unavailable.");
      throw error;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus().catch(() => {}); }, [loadStatus]);

  async function refreshGuide() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPhase("refreshing");
    setFeedback("");
    setValidationIssues([]);
    try {
      const response = await directorFetch("/api/director/guide-content", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.error || payload.result?.message || `Guide refresh failed (${response.status}).`);
        error.validationIssues = Array.isArray(payload.result?.validationIssues) ? payload.result.validationIssues : [];
        throw error;
      }
      const successMessage = payload.result?.noOp
        ? "Participant Guide verified; no content changes were found."
        : "Participant Guide refreshed successfully.";
      const statusReloaded = await loadStatus().then(() => true).catch(() => false);
      setPhase("success");
      setFeedback(statusReloaded ? successMessage : `${successMessage} Refresh status could not be reloaded.`);
      onOperation?.({ label: "Participant Guide refreshed", status: "success", detail: successMessage });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Participant Guide refresh failed.";
      setValidationIssues(Array.isArray(error?.validationIssues) ? error.validationIssues : []);
      await loadStatus().catch(() => {});
      setPhase("failure");
      setFeedback(detail);
      onOperation?.({ label: "Participant Guide refresh", status: "failed", detail });
    } finally {
      requestInFlight.current = false;
    }
  }

  const presentation = directorGuideStatusPresentation(status, { phase, loading: statusLoading, statusError });
  const alert = feedback || (!statusLoading && statusError ? "Guide status is unavailable. Refresh remains available." : "");
  const validationGroups = useMemo(() => groupedValidationIssues(validationIssues), [validationIssues]);

  return <div className={styles.control} data-state={presentation.tone} aria-labelledby="guide-refresh-title">
    <div className={styles.summary}>
      <i aria-hidden="true" />
      <div>
        <small id="guide-refresh-title">Tournament Guide</small>
        <strong>{presentation.label}</strong>
        <span>Last refreshed {presentation.lastRefreshedAt ? timestamp(presentation.lastRefreshedAt) : "not yet available"}</span>
      </div>
    </div>
    <button type="button" disabled={phase === "refreshing"} onClick={refreshGuide}>
      {phase === "refreshing" ? "Refreshing…" : "Refresh Participant Guide"}
    </button>
    {alert ? <p className={styles.feedback} role={(phase === "failure" && !validationGroups.length) || (statusError && !feedback) ? "alert" : "status"}>{alert}</p> : null}
    {validationGroups.length ? <div className={styles.validationDetails} role="alert" aria-label="Participant Guide publication validation failures">
      <strong>Correct these source issues, then refresh again.</strong>
      {validationGroups.map((group) => <section key={group.source}>
        <h3>{group.source}</h3>
        <ul>{group.items.map((issue, index) => <li key={`${issue.entity || "issue"}-${issue.field || index}-${index}`}>
          {validationIssueLabel(issue) ? <b>{validationIssueLabel(issue)}</b> : null}
          <span>{issue.reason}</span>
          {Object.hasOwn(issue, "currentValue") ? <small><b>{group.source === "Canonical Course Context" ? "Current value" : "Google value"}:</b> {issue.currentValue}</small> : null}
          {Object.hasOwn(issue, "expectedValue") ? <small><b>Expected/canonical value:</b> {issue.expectedValue}</small> : null}
        </li>)}</ul>
      </section>)}
    </div> : null}
  </div>;
}
