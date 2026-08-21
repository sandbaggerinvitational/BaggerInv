import { createHmac } from "node:crypto";

const clean = (value) => String(value ?? "").trim();
const blank = (value) => clean(value) === "";

export class ParticipantPhoneOtpError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "ParticipantPhoneOtpError";
    this.code = code;
    this.status = status;
  }
}

export function participantPhoneOtpErrorMessage(code) {
  return ({
    PHONE_OTP_NOT_ENABLED: "The controlled Preview phone test is not enabled.",
    PHONE_OTP_NOT_ELIGIBLE: "This participant is not ready for the controlled phone test.",
    PHONE_OTP_REHEARSAL_ONLY: "Only the approved Preview rehearsal participant can use this controlled test.",
    PHONE_OTP_ALREADY_VERIFIED: "This mobile number is already verified.",
    PHONE_OTP_SESSION_REQUIRED: "Sign in with the approved participant email before enrolling this mobile number.",
    PHONE_OTP_REPAIR_REQUIRED: "Preview Auth phone state requires a reviewed repair before enrollment can continue.",
    PHONE_OTP_DIRECTOR_REQUIRED: "Tournament Director authorization is required.",
    PHONE_OTP_CONTEXT_INVALID: "The controlled phone test request was incomplete.",
    PHONE_OTP_COOLDOWN: "Wait for the resend countdown before requesting another code.",
    PHONE_OTP_RATE_LIMITED: "The controlled phone test has reached its request limit. Try again later.",
    PHONE_OTP_INVALID: "Enter the six-digit code from the verification message.",
    PHONE_OTP_INVALID_OR_EXPIRED: "That code is invalid or expired. Request a new code when the countdown ends.",
    PHONE_OTP_REPLAY: "That verification attempt has already been used.",
    PHONE_OTP_STALE: "The mobile ownership changed. Start a new verification attempt.",
    PHONE_OTP_REVOKED: "Mobile eligibility was revoked. Email sign-in remains available.",
    PHONE_OTP_ENROLLMENT_START_FAILED: "Phone enrollment could not be started safely.",
    PHONE_OTP_AUTH_MISMATCH: "The verified Auth identity did not match the approved participant.",
    PHONE_OTP_AUTH_COLLISION: "This mobile number conflicts with another Auth account.",
    PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED: "This phone is not yet enabled for Preview SMS delivery. Email sign-in remains available.",
    PHONE_OTP_PROVIDER_UNAVAILABLE: "The phone verification provider is temporarily unavailable. Email sign-in remains available.",
    PHONE_OTP_CONFIGURATION_REQUIRED: "Preview phone verification is not completely configured.",
  })[clean(code).toUpperCase()] || "The controlled phone verification could not be completed.";
}

export function participantPhoneOtpClientFingerprint(request, secret) {
  const key = clean(secret);
  if (key.length < 32) {
    throw new ParticipantPhoneOtpError(
      "PHONE_OTP_CONFIGURATION_REQUIRED",
      participantPhoneOtpErrorMessage("PHONE_OTP_CONFIGURATION_REQUIRED"),
      503,
    );
  }
  const forwarded = clean(request?.headers?.get?.("x-forwarded-for")).split(",")[0].trim();
  const userAgent = clean(request?.headers?.get?.("user-agent"));
  return createHmac("sha256", key).update(`${forwarded}|${userAgent}`).digest("hex");
}

export function inspectParticipantAuthUserPhone(user, targetPhone) {
  const target = canonicalParticipantAuthPhone(targetPhone);
  const phone = clean(user?.phone);
  // Supabase Auth's public/admin User response exposes auth.users.phone_change
  // as `new_phone`. Keep the database-shaped fallback for narrow server-side
  // fixtures, but never interpret an identity id as an Auth user id.
  const phoneChange = blank(user?.new_phone) ? clean(user?.phone_change) : clean(user?.new_phone);
  return {
    phoneState: blank(phone) ? "EMPTY" : canonicalParticipantAuthPhone(phone) === target ? "EXPECTED" : "CONFLICT",
    phoneChangeState: blank(phoneChange) ? "EMPTY" : canonicalParticipantAuthPhone(phoneChange) === target ? "EXPECTED" : "CONFLICT",
    phoneConfirmed: Boolean(user?.phone_confirmed_at),
  };
}

export function canonicalParticipantAuthPhone(value) {
  return clean(value).replace(/[^0-9]/g, "");
}

export function assertParticipantPhoneEnrollmentAuthUser(user, {
  expectedAuthUserId,
  expectedEmail,
  targetPhone,
  phase = "before",
}) {
  if (!user?.id || clean(user.id) !== clean(expectedAuthUserId)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  if (clean(user.email).toLowerCase() !== clean(expectedEmail).toLowerCase()) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  const state = inspectParticipantAuthUserPhone(user, targetPhone);
  if (state.phoneChangeState === "CONFLICT" || state.phoneState === "CONFLICT") {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  if (phase === "before" && state.phoneState !== "EMPTY") {
    throw new ParticipantPhoneOtpError("PHONE_OTP_REPAIR_REQUIRED", participantPhoneOtpErrorMessage("PHONE_OTP_REPAIR_REQUIRED"));
  }
  if (phase === "pending" && (state.phoneState !== "EMPTY" || state.phoneChangeState !== "EXPECTED" || state.phoneConfirmed)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  if (phase === "verified" && (state.phoneState !== "EXPECTED" || state.phoneChangeState !== "EMPTY" || !state.phoneConfirmed)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  return state;
}

/**
 * Operation A: request provider verification from the already authenticated
 * email user. Supabase stages phone_change and keeps the current Auth UUID.
 */
export async function requestExistingParticipantPhoneEnrollment({
  authClient,
  expectedAuthUserId,
  targetPhone,
  resend = false,
}) {
  const result = resend
    ? await authClient.auth.resend({ type: "phone_change", phone: targetPhone })
    : await authClient.auth.updateUser({ phone: targetPhone });
  if (result.error) throw result.error;
  const returnedUserId = clean(result.data?.user?.id);
  if (!resend && returnedUserId !== clean(expectedAuthUserId)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  return {
    providerAccepted: true,
    method: resend ? "RESEND_PHONE_CHANGE" : "AUTHENTICATED_UPDATE_USER_PHONE",
    sameAuthUser: true,
    userId: returnedUserId || clean(expectedAuthUserId),
  };
}

export function normalizeParticipantPhoneOtpToken(value) {
  const token = clean(value).replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_INVALID", participantPhoneOtpErrorMessage("PHONE_OTP_INVALID"), 400);
  }
  return token;
}

export async function verifyExistingParticipantPhoneEnrollment({ authClient, phone, token, expectedAuthUserId }) {
  const result = await authClient.auth.verifyOtp({ phone, token, type: "phone_change" });
  if (result.error) return { ok: false, error: result.error, userId: null, sessionCreated: false };
  return {
    ok: clean(result.data?.user?.id) === clean(expectedAuthUserId),
    error: null,
    userId: clean(result.data?.user?.id) || null,
    sessionCreated: Boolean(result.data?.session),
  };
}

/** Operation B: later signed-out login. This is deliberately not used by enrollment. */
export async function requestExistingParticipantPhoneLogin({ authClient, phone }) {
  const result = await authClient.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (result.error) throw result.error;
  return { providerAccepted: true, method: "SIGNED_OUT_PHONE_LOGIN" };
}

export async function verifyExistingParticipantPhoneLogin({ authClient, phone, token, expectedAuthUserId }) {
  const result = await authClient.auth.verifyOtp({ phone, token, type: "sms" });
  if (result.error) return { ok: false, error: result.error, userId: null, sessionCreated: false };
  return {
    ok: clean(result.data?.user?.id) === clean(expectedAuthUserId),
    error: null,
    userId: clean(result.data?.user?.id) || null,
    sessionCreated: Boolean(result.data?.session),
  };
}

export function classifyParticipantPhoneOtpProviderFailure(error, phase = "send") {
  const status = Number(error?.status || 0);
  const rawAuthErrorCode = clean(error?.code).toLowerCase();
  const authErrorCode = /^[a-z0-9_]{1,64}$/.test(rawAuthErrorCode) ? rawAuthErrorCode : "";
  const message = clean(error?.message).toLowerCase();
  if (authErrorCode === "sms_send_failed" && (
    message.includes("21608") ||
    (message.includes("trial account") && message.includes("unverified"))
  )) {
    return {
      code: "PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED",
      authErrorCode: "sms_send_failed",
      authStatus: status || 422,
      providerErrorClass: "TWILIO_21608_TRIAL_RECIPIENT_UNVERIFIED",
      providerCalled: true,
    };
  }
  if (status === 429 || authErrorCode.includes("rate")) {
    return {
      code: "PHONE_OTP_RATE_LIMITED",
      authErrorCode: authErrorCode || "UNKNOWN",
      authStatus: status || 429,
      providerErrorClass: "RATE_LIMIT",
      providerCalled: false,
    };
  }
  if (phase === "verify" && (status === 400 || status === 401 || status === 422 || authErrorCode.includes("otp"))) {
    return {
      code: "PHONE_OTP_INVALID_OR_EXPIRED",
      authErrorCode: authErrorCode || "UNKNOWN",
      authStatus: status,
      providerErrorClass: "INVALID_OR_EXPIRED_OTP",
      providerCalled: false,
    };
  }
  return {
    code: "PHONE_OTP_PROVIDER_UNAVAILABLE",
    authErrorCode: authErrorCode || "UNKNOWN",
    authStatus: status,
    providerErrorClass: authErrorCode === "sms_send_failed" ? "SMS_SEND_FAILED" : "PROVIDER_UNAVAILABLE",
    providerCalled: authErrorCode === "sms_send_failed",
  };
}

export function participantPhoneOtpProviderFailureCode(error, phase = "send") {
  return classifyParticipantPhoneOtpProviderFailure(error, phase).code;
}
