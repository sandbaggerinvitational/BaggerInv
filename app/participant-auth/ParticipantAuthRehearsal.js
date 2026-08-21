"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./participant-auth.module.css";
import { clearParticipantAuthClientState, enableParticipantAuthDiagnostics, flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../../lib/participant-auth-client-diagnostics.js";

export default function ParticipantAuthRehearsal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [requestId, setRequestId] = useState("");
  const [phoneToken, setPhoneToken] = useState("");
  const [phoneEnrollment, setPhoneEnrollment] = useState(null);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    enableParticipantAuthDiagnostics();
    recordParticipantAuthDiagnostic("AUTH_PAGE_LOADED", { routeTo: location.pathname });
    const started = performance.now();
    fetch("/api/participant/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json()).then((payload) => {
        const duration = Math.round(performance.now() - started);
        recordParticipantAuthDiagnostic("SESSION_CHECK", { routeTo: location.pathname, durationMs: duration });
        setSession({ ...payload, localSessionCheckMs: duration });
        if (payload.session === "active") flushParticipantAuthDiagnostics().catch(() => null);
      })
      .catch(() => setSession({ session: "unavailable" }));
  }, []);
  const requestCode = async (event) => {
    event.preventDefault(); setBusy("request"); setMessage("");
    try {
      const started = performance.now();
      const response = await fetch("/api/participant/auth/otp/request", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || "Sign-in code is temporarily unavailable.");
      recordParticipantAuthDiagnostic("OTP_REQUEST", { durationMs: performance.now() - started, routeTo: location.pathname });
      setRequestId(payload.requestId || ""); setMessage(payload.message || "Check your email for a 6-digit code.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const verifyCode = async (event) => {
    event.preventDefault(); setBusy("verify"); setMessage("");
    try {
      const started = performance.now();
      const response = await fetch("/api/participant/auth/otp/verify", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ email, token, requestId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That code is invalid or expired.");
      const duration = Math.round(performance.now() - started);
      recordParticipantAuthDiagnostic("OTP_VERIFICATION", { durationMs: duration, routeTo: location.pathname });
      setSession({ session: "active", linkedPlayerId: payload.linkedPlayerId, otpVerificationMs: duration });
      flushParticipantAuthDiagnostics().catch(() => null);
      setMessage("Participant session established.");
      const requestedNext = String(searchParams.get("next") || "");
      const next = /^\/(?:home|my-match|score|live|me)(?:[/?#]|$)/.test(requestedNext) ? requestedNext : "";
      if (next) router.replace(next);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const logout = async () => {
    setBusy("logout");
    await fetch("/api/participant/auth/session", { method: "DELETE", credentials: "same-origin" });
    clearParticipantAuthClientState();
    setSession({ session: "inactive" }); setToken(""); setPhoneToken(""); setPhoneEnrollment(null); setRequestId(""); setMessage("Preview Auth session cleared. Player Passport is unchanged."); setBusy("");
  };
  const startPhoneEnrollment = async () => {
    if (!window.confirm("Begin phone enrollment for this signed-in email account? This sends one real verification SMS.")) return;
    setBusy("phone-start"); setMessage("");
    try {
      const response = await fetch("/api/participant/auth/phone-enrollment", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Phone enrollment could not be started.");
      setPhoneEnrollment({ attemptId: payload.attemptId, status: payload.status });
      setMessage(payload.message || "Enter the six-digit phone enrollment code.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const verifyPhoneEnrollment = async (event) => {
    event.preventDefault(); setBusy("phone-verify"); setMessage("");
    try {
      const response = await fetch("/api/participant/auth/phone-enrollment", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", attemptId: phoneEnrollment?.attemptId, token: phoneToken }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That phone enrollment code is invalid or expired.");
      setPhoneToken(""); setPhoneEnrollment({ attemptId: "", status: "VERIFIED" });
      setMessage(payload.message || "Mobile verified on the existing Auth user.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  return <main className={styles.page}>
    <section className={styles.card}>
      <span className={styles.eyebrow}>Preview only · Secure participant access</span>
      <h1>Participant sign-in</h1>
      <p>Use your approved tournament email to request a secure sign-in code. Scoring authorization remains match-specific and server enforced.</p>
      {session?.session === "active" ? <>
        <div className={styles.session}><strong>Supabase email session active</strong><span>Linked Player ID: {session.linkedPlayerId}</span><button onClick={logout} disabled={Boolean(busy)}>Log out of Preview Auth</button></div>
        <section className={styles.phoneEnrollment} aria-labelledby="phone-enrollment-title">
          <span className={styles.eyebrow}>Operation A · First-time enrollment</span>
          <h2 id="phone-enrollment-title">Add the approved mobile to this Auth user</h2>
          <p>This uses Supabase’s authenticated phone-change verification. The email Auth UUID and Player Passport stay unchanged. Nothing is sent until you confirm the button.</p>
          {phoneEnrollment?.status === "VERIFIED" ? <strong>Mobile verified on this Auth user.</strong>
            : phoneEnrollment?.status !== "VERIFICATION_PENDING" ? <button type="button" onClick={startPhoneEnrollment} disabled={Boolean(busy)}>{busy === "phone-start" ? "Starting…" : "Begin phone enrollment"}</button>
              : <form onSubmit={verifyPhoneEnrollment}>
                <label>Six-digit phone enrollment code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={phoneToken}
                  onChange={(event) => setPhoneToken(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required /></label>
                <button disabled={Boolean(busy) || phoneToken.length !== 6}>{busy === "phone-verify" ? "Verifying…" : "Verify phone on this Auth user"}</button>
                <small>Enter the code here—never paste it into chat.</small>
              </form>}
          <div className={styles.operationBoundary}><strong>Operation B is separate</strong><span>Signed-out phone login remains disabled until enrollment succeeds and a later physical login test proves it returns this same Auth UUID.</span></div>
        </section>
      </>
        : <>
          <form onSubmit={requestCode}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <button disabled={Boolean(busy)}>{busy === "request" ? "Requesting…" : "Send 6-digit code"}</button></form>
          {requestId ? <form onSubmit={verifyCode}><label>6-digit code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required /></label>
            <button disabled={Boolean(busy) || token.length !== 6}>{busy === "verify" ? "Verifying…" : "Verify code"}</button></form> : null}
        </>}
      {message ? <p className={styles.message} role="status">{message}</p> : null}
      <small>Identity authority: Supabase · Scoring authority: Supabase server transaction</small>
    </section>
  </main>;
}
