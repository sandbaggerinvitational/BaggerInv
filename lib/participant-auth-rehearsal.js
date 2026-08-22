import { createHash } from "node:crypto";
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

export function participantAuthClientRequestHash(value) {
  return createHash("sha256").update(String(value || "unknown-client")).digest("hex");
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
  const captchaRejected = authErrorCode.includes("captcha") || message.includes("captcha");
  return {
    captchaRejected,
    safeReason: captchaRejected ? "AUTH_CAPTCHA_REJECTED" : "AUTH_EMAIL_PROVIDER_REJECTED",
    responseCategory: captchaRejected ? "REQUEST_CHECK_FAILED" : "EMAIL_UNAVAILABLE",
    responseStatus: captchaRejected ? 400 : 503,
  };
}
