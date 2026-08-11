"use client";

import { useCallback, useEffect, useState } from "react";
import { directorFetch } from "../../../lib/director-client-transaction.js";
import styles from "./director.module.css";

const QUALITY = [
  ["activePlayers", "Active players"], ["playersWithEmail", "Valid emails"], ["missingEmail", "Missing"],
  ["duplicateEmail", "Duplicate"], ["malformedEmail", "Malformed"], ["sharedEmail", "Shared"],
  ["inactiveIdentityRecords", "Inactive identity"], ["mappingConflicts", "Mapping conflicts"],
];

export default function ParticipantIdentityFoundationPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/director/participant-identity", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Identity foundation is unavailable.");
    setData(payload);
  }, []);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);
  const act = async (action) => {
    setBusy(action); setMessage("");
    try {
      const response = await directorFetch("/api/director/participant-identity", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, runId: data?.review?.latestRun?.runId, fingerprint: data?.review?.fingerprint }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Identity operation failed.");
      await load();
      setMessage(action === "initialize-source" ? "Preview identity configuration sheet initialized."
        : action === "refresh" ? "Identity configuration imported and validated."
        : action === "provision-single-auth" ? "One approved Preview Auth user and Player link are prepared. No sign-in email was sent."
        : "Identity mapping fingerprint approved. No Auth users were created.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  if (!data) return <section className={styles.identityFoundation}><p>{message || "Loading identity foundation…"}</p></section>;
  const review = data.review;
  const clean = review.quality?.pass === true;
  const latestApproved = review.latestRun?.status === "APPROVED" && review.latestRun?.fingerprint === review.fingerprint;
  const rehearsal = data.authRehearsal;
  return <section className={styles.identityFoundation} aria-labelledby="identity-foundation-title">
    <header><span>Preview only · Non-activating</span><h3 id="identity-foundation-title">Participant Identity Foundation</h3>
      <p>Passport remains authoritative. Shadow Auth is disabled. This surface validates explicit Player ID/email ownership without creating users or sending email.</p></header>
    <div className={styles.identityAuthorityState} data-ready={clean && latestApproved ? "true" : "false"}>
      <strong>{clean && latestApproved ? "Foundation mapping approved" : "Email mapping incomplete"}</strong>
      <span>Authority {data.identity.resolved} · Shadow {data.identity.shadowEnabled ? "enabled" : "disabled"} · Links {review.linkCount}</span>
    </div>
    <div className={styles.identityQuality}>{QUALITY.map(([key, label]) => <article key={key}><small>{label}</small><strong>{review.quality?.[key] ?? 0}</strong></article>)}</div>
    <div className={styles.identityActions}>
      <button disabled={Boolean(busy) || review.source.exists} onClick={() => act("initialize-source")}>{review.source.exists ? "Configuration Sheet Ready" : "Initialize Configuration Sheet"}</button>
      <button disabled={Boolean(busy) || !review.source.exists} onClick={() => act("refresh")}>Refresh Participant Identity Configuration</button>
      <button disabled={Boolean(busy) || !clean || latestApproved || review.latestRun?.fingerprint !== review.fingerprint} onClick={() => act("approve")}>Approve Mapping Fingerprint</button>
      <button disabled={Boolean(busy) || !latestApproved || !rehearsal?.ready || Boolean(rehearsal?.rehearsal)} onClick={() => act("provision-single-auth")}>
        {rehearsal?.rehearsal ? "Single Auth Rehearsal Prepared" : "Provision One Preview Auth User"}
      </button>
    </div>
    {!review.source.exists ? <p className={styles.identityInstruction}>Initialize the dedicated Preview worksheet. Then enter one explicit Tournament ID, Player ID, Email, and Identity Active value per golfer.</p> : null}
    <div className={styles.identityReview} role="region" aria-label="Participant identity mapping review">
      {review.review.map((player) => <article key={player.playerId} data-state={player.validationState}>
        <div><strong>{player.displayName}</strong><span>{player.playerId} · {player.teamId || "Team unassigned"}</span></div>
        <div><b>{player.maskedEmail}</b><small>{player.validationState}</small></div>
      </article>)}
    </div>
    {review.latestRun ? <p className={styles.identityRun}>Latest import: {review.latestRun.status} · revision {review.latestRun.configurationRevision} · fingerprint {review.latestRun.fingerprint.slice(0, 12)}…{review.latestRun.approvedAt ? ` · approved ${new Date(review.latestRun.approvedAt).toLocaleString()}` : ""}</p> : null}
    {rehearsal?.candidate ? <p className={styles.identityRun}>Single rehearsal candidate: {rehearsal.candidate.displayName} · {rehearsal.candidate.playerId} · {rehearsal.candidate.maskedEmail}. Dummy Auth users: {rehearsal.dummyAuthUsers}. No email is sent by provisioning.</p> : null}
    {message ? <p className={styles.identityMessage} role="status">{message}</p> : null}
  </section>;
}
