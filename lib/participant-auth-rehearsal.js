import { createHash, createHmac } from "node:crypto";
import { maskParticipantEmail, normalizeParticipantEmail } from "./participant-identity.js";

const DUMMY_DOMAIN = /(^|\.)(example\.(com|net|org)|invalid|test|localhost)$/i;

export function isDummyParticipantIdentityEmail(value) {
  const normalized = normalizeParticipantEmail(value);
  const domain = normalized.split("@")[1] || "";
  return DUMMY_DOMAIN.test(domain);
}

export function participantAuthEmailHash(value) {
  return createHash("sha256").update(normalizeParticipantEmail(value)).digest("hex");
}

export function participantAuthRateLimitSecret(env = process.env) {
  const secret = String(env.PARTICIPANT_AUTH_RATE_LIMIT_SECRET ||
    env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET || "").trim();
  if (secret.length < 32) {
    const error = new Error("Participant Auth rate limiting is not configured.");
    error.code = "PARTICIPANT_AUTH_RATE_LIMIT_CONFIGURATION_REQUIRED";
    throw error;
  }
  return secret;
}

export function participantAuthClientRequestHash(value, { secret = participantAuthRateLimitSecret() } = {}) {
  return createHmac("sha256", secret).update(String(value || "unknown-client")).digest("hex");
}

export function safeParticipantAuthCandidate(candidate) {
  if (!candidate) return null;
  return {
    playerId: String(candidate.playerId || ""),
    displayName: String(candidate.displayName || ""),
    maskedEmail: maskParticipantEmail(candidate.emailNormalized || candidate.email),
    configurationRevision: Number(candidate.configurationRevision || 0),
  };
}

export function assertSingleParticipantAuthPreflight(preflight = {}) {
  const candidate = preflight.candidate || {};
  if (preflight.approved !== true || preflight.ready !== true) throw new Error("The approved identity mapping is not ready for rehearsal.");
  if (Number(preflight.activePlayers) !== 24 || Number(preflight.realIdentityCount) !== 1 || Number(preflight.dummyIdentityCount) !== 23) {
    throw new Error("Exactly one real and 23 dummy Preview identities are required.");
  }
  if (!candidate.playerId || !candidate.emailNormalized || isDummyParticipantIdentityEmail(candidate.emailNormalized)) {
    throw new Error("The single approved real test identity could not be resolved.");
  }
  if (Number(preflight.dummyAuthUsers) !== 0 || Number(preflight.dummyLinks) !== 0) {
    throw new Error("Dummy identities must not have Auth users or Player links.");
  }
  return candidate;
}

export function participantAuthGenericMessage() {
  return "If that email is approved for The Bagger, a sign-in code will be sent.";
}

export function classifyParticipantEmailOtpAuthError(error = {}) {
  const authErrorCode = String(error.code || "").trim().toLowerCase();
  const message = String(error.message || "").trim().toLowerCase();
  const status = Number(error.status || 0);
  const captchaRejected = authErrorCode.includes("captcha") || message.includes("captcha");
  const rateLimited = status === 429 ||
    authErrorCode.includes("rate_limit") ||
    authErrorCode.includes("rate-limit") ||
    authErrorCode.includes("too_many_requests") ||
    message.includes("rate limit") ||
    message.includes("too many requests");
  const configurationFailure = authErrorCode === "signup_disabled" ||
    authErrorCode.includes("configuration") ||
    message.includes("email provider is disabled") ||
    message.includes("invalid api key") ||
    message.includes("smtp is not configured");
  const providerRejected = authErrorCode.includes("smtp") ||
    authErrorCode.includes("resend") ||
    authErrorCode.includes("provider") ||
    message.includes("smtp") ||
    message.includes("resend") ||
    message.includes("provider rejected") ||
    message.includes("email provider") ||
    message.includes("email address is not verified") ||
    message.includes("error sending confirmation email") ||
    message.includes("error sending recovery email") ||
    message.includes("error sending magic link email");
  const providerRateLimited = rateLimited && !configurationFailure && providerRejected;
  const supabaseRateLimited = rateLimited && !configurationFailure && !providerRateLimited && (
    authErrorCode === "over_email_send_rate_limit" ||
    authErrorCode === "over_request_rate_limit" ||
    authErrorCode === "rate_limit_exceeded" ||
    message.includes("for security purposes, you can only request this after")
  );
  const unknownSourceRateLimited = rateLimited && !configurationFailure && !providerRateLimited && !supabaseRateLimited;
  const serviceUnavailable = !captchaRejected && !rateLimited && !configurationFailure && !providerRejected &&
    (status >= 500 || authErrorCode.includes("unavailable") || message.includes("network"));
  const safeReason = captchaRejected ? "AUTH_CAPTCHA_REJECTED"
    : configurationFailure ? "AUTH_EMAIL_CONFIGURATION_FAILED"
    : providerRateLimited ? "AUTH_SMTP_PROVIDER_RATE_LIMITED"
    : supabaseRateLimited ? "AUTH_SUPABASE_RATE_LIMITED"
    : unknownSourceRateLimited ? "AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE"
    : providerRejected ? "AUTH_SMTP_PROVIDER_REJECTED"
    : serviceUnavailable ? "AUTH_EMAIL_SERVICE_UNAVAILABLE"
    : "AUTH_EMAIL_SEND_FAILED";
  return {
    captchaRejected,
    safeReason,
    providerErrorClass: captchaRejected ? "CAPTCHA_REJECTED"
      : configurationFailure ? "CONFIGURATION_FAILURE"
      : providerRateLimited ? "SMTP_PROVIDER_RATE_LIMIT"
      : supabaseRateLimited ? "SUPABASE_AUTH_RATE_LIMIT"
      : unknownSourceRateLimited ? "RATE_LIMIT_UNKNOWN_SOURCE"
      : providerRejected ? "SMTP_PROVIDER_REJECTION"
      : serviceUnavailable ? "SERVICE_UNAVAILABLE"
      : "SMTP_SEND_FAILED",
    providerCalled: !captchaRejected && !configurationFailure && (providerRateLimited || providerRejected ||
      (!rateLimited && !serviceUnavailable)),
    responseCategory: captchaRejected ? "REQUEST_CHECK_FAILED" : rateLimited ? "RATE_LIMITED" : "EMAIL_UNAVAILABLE",
    responseStatus: captchaRejected ? 400 : rateLimited ? 429 : 503,
  };
}
