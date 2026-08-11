"use client";

import { useEffect, useState } from "react";
import styles from "./participant-auth.module.css";
import { clearParticipantAuthClientState, enableParticipantAuthDiagnostics, flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../../lib/participant-auth-client-diagnostics.js";

export default function ParticipantAuthRehearsal() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [requestId, setRequestId] = useState("");
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
      setMessage("Preview Auth session established. Player Passport remains authoritative.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const logout = async () => {
    setBusy("logout");
    await fetch("/api/participant/auth/session", { method: "DELETE", credentials: "same-origin" });
    clearParticipantAuthClientState();
    setSession({ session: "inactive" }); setToken(""); setRequestId(""); setMessage("Preview Auth session cleared. Player Passport is unchanged."); setBusy("");
  };
  return <main className={styles.page}>
    <section className={styles.card}>
      <span className={styles.eyebrow}>Preview only · Shadow identity rehearsal</span>
      <h1>Participant sign-in</h1>
      <p>Use the one Director-approved rehearsal email. This session is compared with Player Passport but does not authorize scoring or navigation.</p>
      {session?.session === "active" ? <div className={styles.session}><strong>Supabase session active</strong><span>Linked Player ID: {session.linkedPlayerId}</span><button onClick={logout} disabled={Boolean(busy)}>Log out of Preview Auth</button></div>
        : <>
          <form onSubmit={requestCode}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <button disabled={Boolean(busy)}>{busy === "request" ? "Requesting…" : "Send 6-digit code"}</button></form>
          {requestId ? <form onSubmit={verifyCode}><label>6-digit code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required /></label>
            <button disabled={Boolean(busy) || token.length !== 6}>{busy === "verify" ? "Verifying…" : "Verify code"}</button></form> : null}
        </>}
      {message ? <p className={styles.message} role="status">{message}</p> : null}
      <small>Identity authority: Player Passport · Scoring authority remains server-controlled</small>
    </section>
  </main>;
}
