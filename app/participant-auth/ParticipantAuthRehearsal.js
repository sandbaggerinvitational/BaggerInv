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
  const [phoneLoginToken, setPhoneLoginToken] = useState("");
  const [phoneLogin, setPhoneLogin] = useState(null);
  const [maskedMobile, setMaskedMobile] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [phoneLoginResendSeconds, setPhoneLoginResendSeconds] = useState(0);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const restorePhoneEnrollmentState = async () => {
    const response = await fetch("/api/participant/auth/phone-enrollment", { cache: "no-store", credentials: "same-origin" });
    const phoneState = await response.json();
    if (phoneState.status === "VERIFIED") {
      setPhoneEnrollment({ attemptId: "", status: "VERIFIED" });
      return;
    }
    if (phoneState.status === "VERIFICATION_PENDING" && phoneState.attemptId) {
      setPhoneEnrollment({ attemptId: phoneState.attemptId, status: phoneState.status });
      setMaskedMobile(phoneState.maskedMobile || "Approved mobile");
      setResendSeconds(Number(phoneState.resendCooldownSeconds || 0));
      setMessage("Verification code sent.");
      return;
    }
    setPhoneEnrollment({ attemptId: "", status: "NONE" });
  };
  useEffect(() => {
    enableParticipantAuthDiagnostics();
    recordParticipantAuthDiagnostic("AUTH_PAGE_LOADED", { routeTo: location.pathname });
    const started = performance.now();
    fetch("/api/participant/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json()).then((payload) => {
        const duration = Math.round(performance.now() - started);
        recordParticipantAuthDiagnostic("SESSION_CHECK", { routeTo: location.pathname, durationMs: duration });
        setSession({ ...payload, localSessionCheckMs: duration });
        if (payload.session === "active") {
          flushParticipantAuthDiagnostics().catch(() => null);
          restorePhoneEnrollmentState().catch(() => null);
        } else {
          fetch("/api/participant/auth/phone-login-proof", { cache: "no-store", credentials: "same-origin" })
            .then((response) => response.json()).then((phoneState) => {
              if (phoneState.armed === true || phoneState.controlledPhoneLoginAvailable === true) {
                setPhoneLogin({ attemptId: phoneState.attemptId || "", status: phoneState.status || "READY", maskedMobile: phoneState.maskedMobile });
                setPhoneLoginResendSeconds(Number(phoneState.resendCooldownSeconds || 0));
                if (phoneState.status === "VERIFICATION_PENDING") setMessage("Sign-in code sent to the approved mobile.");
              }
            }).catch(() => null);
        }
      })
      .catch(() => setSession({ session: "unavailable" }));
  }, []);
  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);
  useEffect(() => {
    if (phoneLoginResendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setPhoneLoginResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [phoneLoginResendSeconds]);
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
      restorePhoneEnrollmentState().catch(() => null);
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
    setSession({ session: "inactive" }); setToken(""); setPhoneToken(""); setPhoneEnrollment(null); setPhoneLogin({ attemptId: "", status: "READY" }); setRequestId(""); setMessage("Preview Auth session cleared. Player Passport is unchanged."); setBusy("");
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
      setMaskedMobile(payload.maskedMobile || "Approved mobile");
      setResendSeconds(Number(payload.resendCooldownSeconds || 0));
      setMessage(payload.message || "Verification code sent.");
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
  const requestPhoneLoginCode = async () => {
    if (!window.confirm("Send one real sign-in SMS to the already verified approved mobile? There is no automatic resend.")) return;
    setBusy("phone-login-request"); setMessage("");
    try {
      const response = await fetch("/api/participant/auth/phone-login-proof", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The phone sign-in code could not be sent.");
      setPhoneLogin({ attemptId: payload.attemptId, status: payload.status, maskedMobile: payload.maskedMobile });
      setPhoneLoginResendSeconds(Number(payload.resendCooldownSeconds || 0));
      setMessage(payload.message || "Sign-in code sent to the approved mobile.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const verifyPhoneLoginCode = async (event) => {
    event.preventDefault(); setBusy("phone-login-verify"); setMessage("");
    try {
      const response = await fetch("/api/participant/auth/phone-login-proof", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", attemptId: phoneLogin?.attemptId, token: phoneLoginToken }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That phone sign-in code is invalid or expired.");
      const sessionResponse = await fetch("/api/participant/auth/session", { cache: "no-store", credentials: "same-origin" });
      const sessionPayload = await sessionResponse.json();
      if (sessionPayload.session !== "active" || sessionPayload.linkedPlayerId !== payload.linkedPlayerId) {
        throw new Error("The phone was verified, but the participant session could not be restored safely.");
      }
      setSession(sessionPayload); setPhoneLoginToken("");
      setPhoneLogin({ attemptId: "", status: "VERIFIED", maskedMobile: phoneLogin?.maskedMobile });
      setPhoneEnrollment({ attemptId: "", status: "VERIFIED" });
      flushParticipantAuthDiagnostics().catch(() => null);
      setMessage(payload.message || "Phone sign-in verified on the existing Auth user.");
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
          {phoneEnrollment === null ? <strong>Checking verified mobile state…</strong>
            : phoneEnrollment?.status === "VERIFIED" ? <strong>Mobile verified on this Auth user.</strong>
            : phoneEnrollment?.status !== "VERIFICATION_PENDING" ? <button type="button" onClick={startPhoneEnrollment} disabled={Boolean(busy)}>{busy === "phone-start" ? "Starting…" : "Begin phone enrollment"}</button>
              : <form onSubmit={verifyPhoneEnrollment}>
                <strong>Verification code sent</strong>
                <span className={styles.maskedMobile}>{maskedMobile || "Approved mobile"}</span>
                <label>Six-digit phone enrollment code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={phoneToken}
                  onChange={(event) => setPhoneToken(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required /></label>
                <button disabled={Boolean(busy) || phoneToken.length !== 6}>{busy === "phone-verify" ? "Verifying…" : "Verify"}</button>
                <small>{resendSeconds > 0 ? `Resend available in ${resendSeconds}s.` : "The resend countdown has ended. Start over only if this code expires."}</small>
                <small>Enter the code here—never paste it into chat.</small>
              </form>}
          <div className={styles.operationBoundary}><strong>Operation B remains separate</strong><span>Enrollment is complete. The controlled signed-out phone-login proof below authenticates the verified phone without changing ownership.</span></div>
        </section>
        <section className={styles.phoneEnrollment} aria-labelledby="phone-login-proof-title">
          <span className={styles.eyebrow}>Operation B · Controlled Preview proof</span>
          <h2 id="phone-login-proof-title">Test signed-out login on the verified mobile</h2>
          <p>Log out above, then use the signed-out controlled test. It resolves only the designated verified rehearsal mobile on the server. Public participant SMS login remains off.</p>
          <small>Any existing Director entitlement is snapshotted before sign-out and must remain exactly unchanged after phone login.</small>
        </section>
      </>
        : <>
          {phoneLogin ? <section className={styles.phoneEnrollment} aria-labelledby="signed-out-phone-login-title">
            <span className={styles.eyebrow}>Controlled Preview test</span>
            <h2 id="signed-out-phone-login-title">Sign in with the verified approved mobile</h2>
            <p>Preview participant session: signed out. The server resolves only the already verified rehearsal mobile; this page accepts no phone number, Auth UUID, or Player ID.</p>
            {phoneLogin.status === "READY" ? <>
              <strong>Sign in with verified mobile</strong>
              <button type="button" onClick={requestPhoneLoginCode} disabled={Boolean(busy)}>{busy === "phone-login-request" ? "Requesting…" : "Text me a code"}</button>
              <small>One owner-initiated SMS. No automatic resend.</small>
            </> : phoneLogin.status === "VERIFICATION_PENDING" ? <form onSubmit={verifyPhoneLoginCode}>
              <strong>Sign-in code sent</strong>
              <span className={styles.maskedMobile}>{phoneLogin.maskedMobile || "Approved mobile"}</span>
              <label>Six-digit phone sign-in code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={phoneLoginToken}
                onChange={(event) => setPhoneLoginToken(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required /></label>
              <button disabled={Boolean(busy) || phoneLoginToken.length !== 6}>{busy === "phone-login-verify" ? "Verifying…" : "Verify phone sign-in"}</button>
              <small>{phoneLoginResendSeconds > 0 ? `Resend locked for ${phoneLoginResendSeconds}s.` : "No automatic resend. Reload the controlled Preview test if this code expires."}</small>
              <small>Enter the code here—never include it in a screenshot or chat.</small>
            </form> : <strong>Controlled phone sign-in completed.</strong>}
            <div className={styles.operationBoundary}><strong>Email fallback remains available below</strong><span>CAPTCHA and the ordinary public SMS login UI remain deferred to Step 8B.3.</span></div>
          </section> : null}
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
