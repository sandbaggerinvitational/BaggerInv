"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { directorFetch } from "../../../lib/director-client-transaction";
import { directorGuideStatusPresentation } from "../../../lib/director-guide-status.js";
import styles from "./DirectorGuideRefreshControl.module.css";

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet available" : date.toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function DirectorGuideRefreshControl({ onOperation }) {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [feedback, setFeedback] = useState("");
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
    try {
      const response = await directorFetch("/api/director/guide-content", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.result?.message || `Guide refresh failed (${response.status}).`);
      const successMessage = payload.result?.noOp
        ? "Participant Guide verified; no content changes were found."
        : "Participant Guide refreshed successfully.";
      const statusReloaded = await loadStatus().then(() => true).catch(() => false);
      setPhase("success");
      setFeedback(statusReloaded ? successMessage : `${successMessage} Refresh status could not be reloaded.`);
      onOperation?.({ label: "Participant Guide refreshed", status: "success", detail: successMessage });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Participant Guide refresh failed.";
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
    {alert ? <p className={styles.feedback} role={phase === "failure" || (statusError && !feedback) ? "alert" : "status"}>{alert}</p> : null}
  </div>;
}
