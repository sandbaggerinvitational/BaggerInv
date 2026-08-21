"use client";

import { useCallback, useEffect, useState } from "react";
import { directorFetch } from "../../../lib/director-client-transaction.js";
import styles from "./director.module.css";

const QUALITY = [
  ["activePlayers", "Active players"], ["playersWithEmail", "Valid emails"], ["missingEmail", "Missing"],
  ["duplicateEmail", "Duplicate"], ["malformedEmail", "Malformed"], ["sharedEmail", "Shared"],
  ["inactiveIdentityRecords", "Inactive identity"], ["mappingConflicts", "Mapping conflicts"],
];
const MOBILE_QUALITY = [
  ["eligiblePlayers", "Eligible players"], ["authLinkedPlayers", "Auth linked"],
  ["phoneConfigured", "Mobile configured"], ["phoneEligibleUnverified", "Not verified"],
  ["phoneVerified", "Verified"], ["phoneRevoked", "Revoked"],
  ["duplicatePhone", "Duplicates"], ["authUserMismatch", "Auth conflicts"],
];
const MOBILE_LABELS = {
  NOT_CONFIGURED: "Not configured",
  ELIGIBLE_NOT_VERIFIED: "Eligible · Not verified",
  VERIFICATION_PENDING: "Verification pending",
  VERIFIED: "Verified",
  REVOKED: "Revoked",
  PHONE_CONFLICT: "Conflict",
  PENDING_AUTH_PHONE_COLLISION: "Pending Auth phone collision",
  AUTH_USER_MISMATCH: "Auth user mismatch",
  AUTH_SETUP_REQUIRED: "Auth setup required",
};
const filterMobile = (player, filter) => filter === "ALL"
  || (filter === "MISSING" && ["NOT_CONFIGURED", "AUTH_SETUP_REQUIRED", "REVOKED"].includes(player.mobile?.status))
  || (filter === "UNVERIFIED" && ["ELIGIBLE_NOT_VERIFIED", "VERIFICATION_PENDING"].includes(player.mobile?.status))
  || (filter === "READY" && player.mobile?.status === "VERIFIED");

export default function ParticipantIdentityFoundationPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [mobileEdit, setMobileEdit] = useState(null);
  const [mobileValue, setMobileValue] = useState("");
  const [mobileFilter, setMobileFilter] = useState("ALL");
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
        : action === "confirm-single-auth-email" ? "The approved Preview Auth email is administratively confirmed. No OTP was sent."
        : "Identity mapping fingerprint approved. No Auth users were created.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const manageMobile = async ({ action, playerId, displayName }) => {
    const destructive = action === "change-mobile" || action === "revoke-mobile";
    if (destructive && !window.confirm(`${action === "change-mobile" ? "Change" : "Revoke"} mobile eligibility for ${displayName}? Email sign-in remains available.`)) return;
    setBusy(`${action}:${playerId}`); setMessage("");
    try {
      const response = await directorFetch("/api/director/participant-identity", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, playerId, phone: action === "revoke-mobile" ? undefined : mobileValue }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Mobile eligibility could not be updated.");
      await load();
      setMobileEdit(null); setMobileValue("");
      setMessage(action === "add-mobile" ? "Mobile eligibility added. No verification or SMS was performed."
        : action === "change-mobile" ? "Mobile eligibility changed. The new number is not verified and no SMS was sent."
        : "Mobile eligibility revoked. Email sign-in remains available.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  if (!data) return <section className={styles.identityFoundation}><p>{message || "Loading identity foundation…"}</p></section>;
  const review = data.review;
  const clean = review.quality?.pass === true;
  const latestApproved = review.latestRun?.status === "APPROVED" && review.latestRun?.fingerprint === review.fingerprint;
  const rehearsal = data.authRehearsal;
  const phoneOwnership = data.phoneOwnership || { counts: {}, players: [] };
  const phoneOtp = data.phoneOtp || { enabled: false, counts: {}, players: [] };
  const phoneByPlayer = new Map((phoneOwnership.players || []).map((player) => [player.playerId, player]));
  const phoneOtpByPlayer = new Map((phoneOtp.players || []).map((player) => [player.playerId, player]));
  const identityPlayers = review.review.map((player) => ({ ...player, ...(phoneByPlayer.get(player.playerId) || {}),
    mobile: phoneByPlayer.get(player.playerId)?.mobile || { status: "AUTH_SETUP_REQUIRED" } }));
  const filteredPlayers = identityPlayers.filter((player) => filterMobile(player, mobileFilter));
  return <section className={styles.identityFoundation} aria-labelledby="identity-foundation-title">
    <header><span>Preview only · Identity foundation</span><h3 id="identity-foundation-title">Participant Identity Foundation</h3>
      <p>Email authentication and Player ID ownership remain unchanged. Mobile numbers added here are eligible but unverified; this surface cannot send SMS or update Supabase Auth phone fields.</p></header>
    <div className={styles.identityAuthorityState} data-ready={clean && latestApproved ? "true" : "false"}>
      <strong>{clean && latestApproved ? "Foundation mapping approved" : "Email mapping incomplete"}</strong>
      <span>Authority {data.identity.resolved} · Shadow {data.identity.shadowEnabled ? "enabled" : "disabled"} · Links {review.linkCount}</span>
    </div>
    <div className={styles.identityQuality}>{QUALITY.map(([key, label]) => <article key={key}><small>{label}</small><strong>{review.quality?.[key] ?? 0}</strong></article>)}</div>
    <div className={styles.identityMobileSummary} aria-label="Mobile authentication readiness">
      <div><strong>Authentication methods</strong><span>{phoneOtp.enabled ? "Authenticated phone enrollment test enabled · participant SMS login off" : "Protected Supabase ownership · provider test off"}</span></div>
      <div className={styles.identityQuality}>{MOBILE_QUALITY.map(([key, label]) => <article key={key}><small>{label}</small><strong>{phoneOwnership.counts?.[key] ?? 0}</strong></article>)}</div>
    </div>
    <div className={styles.identityActions}>
      <button disabled={Boolean(busy) || review.source.exists} onClick={() => act("initialize-source")}>{review.source.exists ? "Configuration Sheet Ready" : "Initialize Configuration Sheet"}</button>
      <button disabled={Boolean(busy) || !review.source.exists} onClick={() => act("refresh")}>Refresh Participant Identity Configuration</button>
      <button disabled={Boolean(busy) || !clean || latestApproved || review.latestRun?.fingerprint !== review.fingerprint} onClick={() => act("approve")}>Approve Mapping Fingerprint</button>
      <button disabled={Boolean(busy) || !latestApproved || !rehearsal?.ready || Boolean(rehearsal?.rehearsal)} onClick={() => act("provision-single-auth")}>
        {rehearsal?.rehearsal ? "Single Auth Rehearsal Prepared" : "Provision One Preview Auth User"}
      </button>
      <button disabled={Boolean(busy) || !rehearsal?.rehearsal || rehearsal?.authUser?.emailConfirmed !== false} onClick={() => act("confirm-single-auth-email")}>
        {rehearsal?.authUser?.emailConfirmed ? "Approved Auth Email Confirmed" : "Confirm Approved Auth Email"}
      </button>
    </div>
    {!review.source.exists ? <p className={styles.identityInstruction}>Initialize the dedicated Preview worksheet. Then enter one explicit Tournament ID, Player ID, Email, and Identity Active value per golfer.</p> : null}
    <div className={styles.identityRosterControls}>
      <label htmlFor="mobile-readiness-filter">Mobile readiness</label>
      <select id="mobile-readiness-filter" value={mobileFilter} onChange={(event) => setMobileFilter(event.target.value)}>
        <option value="ALL">All participants</option><option value="MISSING">Mobile missing</option>
        <option value="UNVERIFIED">Mobile unverified</option><option value="READY">Verified</option>
      </select><span>{filteredPlayers.length} of {identityPlayers.length}</span>
    </div>
    <div className={styles.identityReview} role="region" aria-label="Participant authentication methods review">
      {filteredPlayers.map((player) => {
        const mobileStatus = player.mobile?.status || "NOT_CONFIGURED";
        const hasCurrentMobile = Boolean(player.mobile?.identifierId);
        const canManage = player.authLinkStatus === "ACTIVE";
        const editMode = mobileEdit?.playerId === player.playerId ? mobileEdit.mode : "";
        const otpState = phoneOtpByPlayer.get(player.playerId);
        const phoneVerified = mobileStatus === "VERIFIED" || otpState?.preflightStatus === "VERIFIED";
        return <article className={styles.identityPlayerCard} key={player.playerId} data-state={player.validationState} data-mobile-state={mobileStatus}>
          <div className={styles.identityPlayerHeading}><strong>{player.displayName}</strong><span>{player.playerId} · {player.teamId || "Team unassigned"}</span></div>
          <div className={styles.identityAuthMethods}>
            <section><small>Email</small><b>{player.maskedEmail}</b><span>{player.validationState === "VALID" ? "Email ownership valid" : player.validationState}</span></section>
            <section><small>Mobile</small><b>{player.mobile?.masked || "Not configured"}</b><span data-alert={mobileStatus.includes("CONFLICT") || mobileStatus.includes("COLLISION") || mobileStatus.includes("MISMATCH") ? "true" : undefined}>{MOBILE_LABELS[mobileStatus] || "Not configured"}</span></section>
            <section><small>Auth link</small><b>{player.authLinkStatus || "NOT_PROVISIONED"}</b><span>{canManage ? "Same Auth user required" : "Provision Auth before mobile"}</span></section>
          </div>
          <div className={styles.identityMethodActions}>
            {!hasCurrentMobile ? <button type="button" disabled={Boolean(busy) || !canManage} onClick={() => { setMobileEdit({ playerId: player.playerId, mode: "add" }); setMobileValue(""); }}>Add Mobile</button> : null}
            {hasCurrentMobile ? <button type="button" disabled={Boolean(busy)} onClick={() => { setMobileEdit({ playerId: player.playerId, mode: "change" }); setMobileValue(""); }}>Change Mobile</button> : null}
            {hasCurrentMobile ? <button className={styles.identityRevokeButton} type="button" disabled={Boolean(busy)} onClick={() => manageMobile({ action: "revoke-mobile", playerId: player.playerId, displayName: player.displayName })}>Revoke Mobile</button> : null}
          </div>
          {editMode ? <form className={styles.identityPhoneForm} onSubmit={(event) => { event.preventDefault(); manageMobile({ action: editMode === "change" ? "change-mobile" : "add-mobile", playerId: player.playerId, displayName: player.displayName }); }}>
            <label htmlFor={`mobile-${player.playerId}`}>{editMode === "change" ? "New mobile number" : "Mobile number"}</label>
            <input id={`mobile-${player.playerId}`} type="tel" autoComplete="off" inputMode="tel" required value={mobileValue} onChange={(event) => setMobileValue(event.target.value)} placeholder="(214) 555-1234" />
            <p>{editMode === "change" ? "The prior mobile will be revoked. " : ""}Saving creates eligible, unverified ownership only. No SMS is sent.</p>
            <div><button type="button" disabled={Boolean(busy)} onClick={() => { setMobileEdit(null); setMobileValue(""); }}>Cancel</button><button type="submit" disabled={Boolean(busy) || !mobileValue.trim()}>{busy ? "Saving…" : editMode === "change" ? "Review Change" : "Add Mobile"}</button></div>
          </form> : null}
          {phoneOtp.enabled && otpState ? <section className={styles.identityPhoneOtp} aria-labelledby={`phone-otp-${player.playerId}`}>
            <div className={styles.identityPhoneOtpHeading}>
              <div><small>Preview provider proof</small><strong id={`phone-otp-${player.playerId}`}>{phoneVerified ? "Mobile verified" : "Email-session enrollment required"}</strong></div>
              <span data-ready={otpState.preflightReady || phoneVerified ? "true" : "false"}>{phoneVerified ? "Verified" : otpState.preflightReady ? "Preflight ready" : otpState.preflightStatus?.replaceAll("_", " ") || "Not ready"}</span>
            </div>
            <p>{phoneVerified
              ? "Supabase Auth and Participant Identity agree on the existing Auth user. Email sign-in remains available."
              : "Operation A must be performed while the approved golfer is signed in by email. The Director surface approves ownership and reports state; it cannot attach a phone or send an enrollment code."}</p>
            {!phoneVerified ? <div className={styles.identityPhoneOtpFacts} aria-label="Phone verification preflight">
              <span>Auth phone: {otpState.authPhoneState || "UNKNOWN"}</span>
              <span>phone_change: {otpState.authPhoneChangeState || "UNKNOWN"}</span>
              <span>Other-user collision: {otpState.otherAuthUserCollision ? "BLOCKED" : "NONE"}</span>
            </div> : null}
            {!phoneVerified ? <div className={styles.identityPhoneOtpFacts} aria-label="Enrollment and login boundary">
              <span>Operation A: email sign-in → Participant sign-in → Begin phone enrollment</span>
              <span>Operation B: sign out → phone login test only after enrollment succeeds</span>
              <span>Participant SMS login: OFF</span>
            </div> : null}
          </section> : null}
        </article>;
      })}
    </div>
    {review.latestRun ? <p className={styles.identityRun}>Latest import: {review.latestRun.status} · revision {review.latestRun.configurationRevision} · fingerprint {review.latestRun.fingerprint.slice(0, 12)}…{review.latestRun.approvedAt ? ` · approved ${new Date(review.latestRun.approvedAt).toLocaleString()}` : ""}</p> : null}
    {rehearsal?.candidate ? <p className={styles.identityRun}>Single rehearsal candidate: {rehearsal.candidate.displayName} · {rehearsal.candidate.playerId} · {rehearsal.candidate.maskedEmail}. Dummy Auth users: {rehearsal.dummyAuthUsers}. No email is sent by provisioning.</p> : null}
    {rehearsal?.rehearsal ? <p className={styles.identityRun}>Auth participants: {rehearsal.participantAuthUsers} · Active links: {rehearsal.participantLinks} · Dummy users: {rehearsal.dummyAuthUsers} · Dummy links: {rehearsal.dummyLinks} · Email {rehearsal.authUser?.emailConfirmed ? "confirmed" : "unconfirmed"}.</p> : null}
    {rehearsal?.requestAudit?.latestAttempt ? <p className={styles.identityRun}>Latest OTP request: {rehearsal.requestAudit.latestAttempt.status} · {rehearsal.requestAudit.latestAttempt.safeReason || "recorded"} · attempts recorded {rehearsal.requestAudit.attemptCount}. OTP values and tokens are never retained.</p> : null}
    {rehearsal?.requestAudit?.authLogActions?.length ? <p className={styles.identityRun}>Safe Auth log: {rehearsal.requestAudit.authLogActions.map((entry) => `${entry.action || entry.logType || "recorded"} at ${new Date(entry.createdAt).toLocaleString()}`).join(" · ")}. No Auth payload, token, code, or IP is exposed.</p> : null}
    {message ? <p className={styles.identityMessage} role="status">{message}</p> : null}
  </section>;
}
