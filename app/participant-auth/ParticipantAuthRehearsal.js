"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ParticipantAuthTurnstile from "./ParticipantAuthTurnstile.js";
import styles from "./participant-auth.module.css";
import {
  enableParticipantAuthDiagnostics,
  flushParticipantAuthDiagnostics,
  recordParticipantAuthDiagnostic,
  rememberParticipantAuthNavigation,
} from "../../lib/participant-auth-client-diagnostics.js";

function participantDestination(searchParams) {
  const requestedNext = String(searchParams.get("next") || "");
  return /^\/(?:home|my-match|score|live|me)(?:[/?#]|$)/.test(requestedNext) ? requestedNext : "/home";
}

function formatUsMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function maskEnteredEmail(value) {
  const [local = "", domain = ""] = String(value || "").trim().toLowerCase().split("@");
  if (!local || !domain) return "your email";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(4, Math.min(8, local.length - 1)))}@${domain}`;
}

function networkMessage(error) {
  return error instanceof TypeError ? "Connection lost. Try again." : cleanMessage(error?.message);
}

function cleanMessage(value) {
  const message = String(value || "").trim();
  return message || "We couldn't complete that request. Try again.";
}

export default function ParticipantAuthRehearsal({ experience }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = participantDestination(searchParams);
  const [sessionState, setSessionState] = useState("checking");
  const [method, setMethod] = useState(experience.defaultMethod);
  const [step, setStep] = useState("entry");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [requestId, setRequestId] = useState("");
  const [maskedDestination, setMaskedDestination] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authTransition, setAuthTransition] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const otpRef = useRef(null);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken("");
    setCaptchaResetKey((value) => value + 1);
  }, []);

  const beginNavigation = useCallback((authMethod, payload, durationMs) => {
    if (payload.session !== "active" || !payload.linkedPlayerId) {
      throw new Error("We couldn't connect this sign-in to your tournament profile. Please use email or contact the Tournament Director.");
    }
    if (authMethod === "phone" && (
      payload.sameAuthUser !== true || payload.participantSessionEstablished !== true ||
      payload.refreshSessionAvailable !== true || payload.playerPassportResolved !== true ||
      payload.scoringAuthorizationUnchanged !== true || payload.phoneIdentifierUnchanged !== true ||
      payload.directorEntitlementPreserved !== true || Number(payload.newDirectorEntitlements || 0) !== 0 ||
      payload.directorPrivilegeEscalation === true || payload.authMethodChangesDirectorAuthorization === true
    )) {
      throw new Error("We couldn't sign you in. Please use email or contact the Tournament Director.");
    }
    const navigationType = authMethod === "phone" ? "PHONE_OTP" : "EMAIL_OTP";
    recordParticipantAuthDiagnostic("AUTH_SESSION_ESTABLISHED", { durationMs, routeTo: location.pathname, navigationType });
    setAuthTransition(true);
    setMessage("Opening The Bagger…");
    rememberParticipantAuthNavigation(location.pathname, next, navigationType);
    recordParticipantAuthDiagnostic("LOGIN_REDIRECT_INITIATED", {
      durationMs,
      routeFrom: location.pathname,
      routeTo: next,
      navigationType,
    });
    router.replace(next);
  }, [next, router]);

  useEffect(() => {
    enableParticipantAuthDiagnostics();
    router.prefetch(next);
    recordParticipantAuthDiagnostic("AUTH_PAGE_LOADED", { routeTo: location.pathname });
    const started = performance.now();
    fetch("/api/participant/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(async ({ response, payload }) => {
        const duration = Math.round(performance.now() - started);
        recordParticipantAuthDiagnostic("SESSION_CHECK", { routeTo: location.pathname, durationMs: duration });
        if (response.ok && payload.session === "active" && payload.linkedPlayerId) {
          flushParticipantAuthDiagnostics().catch(() => null);
          setAuthTransition(true);
          setMessage("Opening The Bagger…");
          rememberParticipantAuthNavigation(location.pathname, next, "SESSION_RESTORE");
          router.replace(next);
          return;
        }
        setSessionState("signed-out");
        if (!experience.smsEnabled) return;
        const phoneState = await fetch("/api/participant/auth/phone", { cache: "no-store", credentials: "same-origin" })
          .then((result) => result.ok ? result.json() : null)
          .catch(() => null);
        if (phoneState?.status === "VERIFICATION_PENDING" && phoneState.attemptId) {
          setMethod("phone");
          setStep("code");
          setRequestId(phoneState.attemptId);
          setMaskedDestination(phoneState.maskedMobile || "your mobile");
          setResendSeconds(Number(phoneState.resendCooldownSeconds || 0));
          setMessage("Enter the code from your text message.");
        }
      })
      .catch(() => {
        setSessionState("signed-out");
        setError("Connection lost. Try again.");
      });
  }, [experience.smsEnabled, next, router]);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (sessionState !== "signed-out") return;
    const target = step === "code" ? otpRef.current : method === "phone" ? phoneRef.current : emailRef.current;
    window.setTimeout(() => target?.focus({ preventScroll: true }), 60);
  }, [method, sessionState, step]);

  const clearFeedback = () => { setError(""); setMessage(""); };

  const cancelPhoneAttempt = useCallback(async () => {
    if (method !== "phone" || step !== "code" || !requestId) return;
    await fetch("/api/participant/auth/phone", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", attemptId: requestId }),
    }).catch(() => null);
  }, [method, requestId, step]);

  const switchMethod = async (nextMethod) => {
    if (busy || nextMethod === method) return;
    await cancelPhoneAttempt();
    setMethod(nextMethod);
    setStep("entry");
    setToken("");
    setRequestId("");
    setMaskedDestination("");
    setResendSeconds(0);
    clearFeedback();
    resetCaptcha();
  };

  const requestPhoneCode = async (event) => {
    event?.preventDefault();
    if (busy) return;
    if (experience.captchaRequired && !captchaToken) {
      setError("Complete the request check, then try again.");
      return;
    }
    setBusy("phone-request");
    clearFeedback();
    const started = performance.now();
    try {
      const response = await fetch("/api/participant/auth/phone", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", phone, captchaToken }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Text sign-in is temporarily unavailable. Use email instead.");
      setRequestId(payload.attemptId || "");
      setMaskedDestination(payload.maskedMobile || "your mobile");
      setResendSeconds(Number(payload.resendCooldownSeconds || 60));
      setStep("code");
      setMessage(payload.message || "If that mobile number is approved, a code will arrive shortly.");
      recordParticipantAuthDiagnostic("PHONE_OTP_REQUEST", { durationMs: Math.round(performance.now() - started), routeTo: location.pathname });
      resetCaptcha();
    } catch (requestError) {
      setError(networkMessage(requestError));
      resetCaptcha();
    } finally { setBusy(""); }
  };

  const requestEmailCode = async (event) => {
    event?.preventDefault();
    if (busy) return;
    if (experience.captchaRequired && !captchaToken) {
      setError("Complete the request check, then try again.");
      return;
    }
    setBusy("email-request");
    clearFeedback();
    const started = performance.now();
    try {
      const response = await fetch("/api/participant/auth/otp/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || "Email sign-in is temporarily unavailable.");
      setRequestId(payload.requestId || "");
      setMaskedDestination(maskEnteredEmail(email));
      setResendSeconds(60);
      setStep("code");
      setMessage(payload.message || "If that email is approved, a code will arrive shortly.");
      recordParticipantAuthDiagnostic("OTP_REQUEST", { durationMs: Math.round(performance.now() - started), routeTo: location.pathname });
      resetCaptcha();
    } catch (requestError) {
      setError(networkMessage(requestError));
      resetCaptcha();
    } finally { setBusy(""); }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (busy || token.length !== 6) return;
    setBusy("verify");
    clearFeedback();
    const started = performance.now();
    try {
      const endpoint = method === "phone" ? "/api/participant/auth/phone" : "/api/participant/auth/otp/verify";
      const body = method === "phone"
        ? { action: "verify", attemptId: requestId, token }
        : { email, requestId, token };
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That code is invalid or expired. Try again or request a new code.");
      const duration = Math.round(performance.now() - started);
      recordParticipantAuthDiagnostic(method === "phone" ? "PHONE_OTP_VERIFY_RESPONSE" : "EMAIL_OTP_VERIFY_RESPONSE", {
        durationMs: duration,
        routeTo: location.pathname,
        navigationType: method === "phone" ? "PHONE_OTP" : "EMAIL_OTP",
      });
      beginNavigation(method, payload, duration);
    } catch (verifyError) {
      setError(networkMessage(verifyError));
      setToken("");
      otpRef.current?.focus();
      setBusy("");
    }
  };

  const resendCode = async () => {
    if (busy || resendSeconds > 0) return;
    if (experience.captchaRequired && !captchaToken) {
      setError("Complete the request check, then try again.");
      return;
    }
    if (method === "email") return requestEmailCode();
    setBusy("phone-resend");
    clearFeedback();
    try {
      const response = await fetch("/api/participant/auth/phone", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resend", attemptId: requestId, phone, captchaToken }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Text sign-in is temporarily unavailable. Use email instead.");
      setRequestId(payload.attemptId || "");
      setMaskedDestination(payload.maskedMobile || maskedDestination);
      setResendSeconds(Number(payload.resendCooldownSeconds || 60));
      setToken("");
      setMessage(payload.message || "A new code is on its way.");
      resetCaptcha();
    } catch (resendError) {
      setError(networkMessage(resendError));
      resetCaptcha();
    } finally { setBusy(""); }
  };

  const changeIdentifier = async () => {
    if (busy) return;
    await cancelPhoneAttempt();
    setStep("entry");
    setToken("");
    setRequestId("");
    setMaskedDestination("");
    setResendSeconds(0);
    clearFeedback();
    resetCaptcha();
  };

  const captcha = experience.captchaRequired && (step === "entry" || resendSeconds === 0)
    ? <ParticipantAuthTurnstile
        siteKey={experience.captchaSiteKey}
        action={method === "phone" ? "participant_sms_login" : "participant_email_login"}
        onTokenChange={setCaptchaToken}
        resetKey={captchaResetKey}
      />
    : null;

  if (sessionState === "checking" || authTransition) {
    return <main className={styles.page}>
      <section className={`${styles.card} ${styles.startup}`} aria-live="polite" aria-busy="true">
        <Image className={styles.logo} src="/icon-192.png" alt="" width={64} height={64} priority />
        <strong>The Bagger</strong>
        <span>{authTransition ? "Opening The Bagger…" : "Getting things ready…"}</span>
        <i aria-hidden="true" />
      </section>
    </main>;
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="participant-auth-title">
      <header className={styles.header}>
        {experience.preview ? <span className={styles.preview}>Preview</span> : null}
        <div className={styles.brand}>
          <Image className={styles.logo} src="/icon-192.png" alt="" width={58} height={58} priority />
          <span>The Bagger</span>
        </div>
        <h1 id="participant-auth-title">{step === "code" ? "Enter your code" : "Welcome to The Bagger"}</h1>
        <p>{step === "code"
          ? method === "phone"
            ? <>If this mobile number is approved, a 6-digit code will arrive at <strong>{maskedDestination}</strong>.</>
            : <>If this email is approved, a 6-digit code will arrive at <strong>{maskedDestination}</strong>.</>
          : "Sign in to access your tournament."}</p>
      </header>

      {step === "entry" ? method === "phone" ? <form className={styles.form} onSubmit={requestPhoneCode} noValidate>
        <label htmlFor="participant-mobile">Mobile Number</label>
        <input ref={phoneRef} id="participant-mobile" name="mobile" type="tel" inputMode="tel" autoComplete="tel"
          placeholder="(###) ###-####" value={phone} onChange={(event) => { setPhone(formatUsMobile(event.target.value)); setError(""); }}
          aria-invalid={error ? "true" : undefined} aria-describedby={error ? "auth-error" : undefined} required />
        {captcha}
        <button className={styles.primary} disabled={Boolean(busy) || phone.replace(/\D/g, "").length !== 10}>
          {busy === "phone-request" ? "Sending code…" : "Text Me a Code"}
        </button>
        <div className={styles.switcher}><span>Prefer email?</span><button type="button" onClick={() => switchMethod("email")}>Use Email Instead</button></div>
      </form> : <form className={styles.form} onSubmit={requestEmailCode} noValidate>
        <label htmlFor="participant-email">Email</label>
        <input ref={emailRef} id="participant-email" name="email" type="email" inputMode="email" autoComplete="email"
          placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }}
          aria-invalid={error ? "true" : undefined} aria-describedby={error ? "auth-error" : undefined} required />
        {captcha}
        <button className={styles.primary} disabled={Boolean(busy) || !email.trim()}>
          {busy === "email-request" ? "Sending code…" : "Send Me a Code"}
        </button>
        {experience.smsEnabled
          ? <div className={styles.switcher}><span>Prefer text?</span><button type="button" onClick={() => switchMethod("phone")}>Use Mobile Instead</button></div>
          : null}
      </form> : <form className={styles.form} onSubmit={verifyCode}>
        <label htmlFor="participant-code">6-digit code</label>
        <input ref={otpRef} className={styles.otp} id="participant-code" name="code" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} value={token}
          onChange={(event) => { setToken(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          aria-invalid={error ? "true" : undefined} aria-describedby={error ? "auth-error" : undefined} required />
        <button className={styles.primary} disabled={Boolean(busy) || token.length !== 6}>
          {busy === "verify" ? "Verifying…" : "Verify"}
        </button>
        <div className={styles.resend}>
          <span>Didn't get it?</span>
          {resendSeconds > 0
            ? <span aria-label={`Resend available in ${resendSeconds} seconds`}>Resend code in 0:{String(resendSeconds).padStart(2, "0")}</span>
            : <>{captcha}<button type="button" onClick={resendCode} disabled={Boolean(busy)}>{busy.includes("resend") ? "Sending code…" : "Resend code"}</button></>}
        </div>
        <button className={styles.secondary} type="button" onClick={changeIdentifier} disabled={Boolean(busy)}>
          {method === "phone" ? "Use a different number" : "Use a different email"}
        </button>
        <button className={styles.linkButton} type="button" onClick={() => switchMethod(method === "phone" ? "email" : "phone")} disabled={Boolean(busy) || (method === "email" && !experience.smsEnabled)}>
          {method === "phone" ? "Use Email Instead" : "Use Mobile Instead"}
        </button>
      </form>}

      {!experience.smsEnabled && experience.smsRequested
        ? <p className={styles.notice}>Text sign-in is temporarily unavailable. Use email instead.</p>
        : null}
      {message ? <p className={styles.status} role="status" aria-live="polite">{message}</p> : null}
      {error ? <p className={styles.error} id="auth-error" role="alert">{error}</p> : null}
    </section>
  </main>;
}
