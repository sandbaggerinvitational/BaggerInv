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
    PHONE_OTP_DIRECTOR_REQUIRED: "Tournament Director authorization is required.",
    PHONE_OTP_CONTEXT_INVALID: "The controlled phone test request was incomplete.",
    PHONE_OTP_COOLDOWN: "Wait for the resend countdown before requesting another code.",
    PHONE_OTP_RATE_LIMITED: "The controlled phone test has reached its request limit. Try again later.",
    PHONE_OTP_INVALID: "Enter the six-digit code from the verification message.",
    PHONE_OTP_INVALID_OR_EXPIRED: "That code is invalid or expired. Request a new code when the countdown ends.",
    PHONE_OTP_REPLAY: "That verification attempt has already been used.",
    PHONE_OTP_STALE: "The mobile ownership changed. Start a new verification attempt.",
    PHONE_OTP_REVOKED: "Mobile eligibility was revoked. Email sign-in remains available.",
    PHONE_OTP_AUTH_MISMATCH: "The verified Auth identity did not match the approved participant.",
    PHONE_OTP_AUTH_COLLISION: "This mobile number conflicts with another Auth account.",
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
  const target = clean(targetPhone);
  const phone = clean(user?.phone);
  const phoneChange = clean(user?.phone_change);
  return {
    phoneState: blank(phone) ? "EMPTY" : phone === target ? "EXPECTED" : "CONFLICT",
    phoneChangeState: blank(phoneChange) ? "EMPTY" : phoneChange === target ? "EXPECTED" : "CONFLICT",
    phoneConfirmed: Boolean(user?.phone_confirmed_at),
  };
}

function assertExpectedAuthUser(user, { expectedAuthUserId, expectedEmail, targetPhone, allowEmptyPhone = true }) {
  if (!user?.id || clean(user.id) !== clean(expectedAuthUserId)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  if (clean(user.email).toLowerCase() !== clean(expectedEmail).toLowerCase()) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  const state = inspectParticipantAuthUserPhone(user, targetPhone);
  if (state.phoneChangeState === "CONFLICT" || state.phoneState === "CONFLICT" || (!allowEmptyPhone && state.phoneState !== "EXPECTED")) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  return state;
}

/** Attach an unverified phone through the supported Supabase Admin API. */
export async function attachPhoneToExistingParticipantAuthUser({
  adminClient,
  expectedAuthUserId,
  expectedEmail,
  targetPhone,
}) {
  const beforeLookup = await adminClient.auth.admin.getUserById(expectedAuthUserId);
  if (beforeLookup.error) throw beforeLookup.error;
  const before = assertExpectedAuthUser(beforeLookup.data?.user, {
    expectedAuthUserId, expectedEmail, targetPhone, allowEmptyPhone: true,
  });
  let attached = false;
  if (before.phoneState === "EMPTY") {
    const update = await adminClient.auth.admin.updateUserById(expectedAuthUserId, {
      phone: targetPhone,
      phone_confirm: false,
    });
    if (update.error) throw update.error;
    attached = true;
  }
  const afterLookup = await adminClient.auth.admin.getUserById(expectedAuthUserId);
  if (afterLookup.error) throw afterLookup.error;
  const after = assertExpectedAuthUser(afterLookup.data?.user, {
    expectedAuthUserId, expectedEmail, targetPhone, allowEmptyPhone: false,
  });
  return {
    attached,
    sameAuthUser: true,
    emailPreserved: true,
    phoneStateBefore: before.phoneState,
    phoneChangeStateBefore: before.phoneChangeState,
    phoneStateAfter: after.phoneState,
    phoneChangeStateAfter: after.phoneChangeState,
    phoneConfirmedAfterAttachment: after.phoneConfirmed,
  };
}

export async function requestExistingParticipantPhoneOtp({ otpClient, phone }) {
  const result = await otpClient.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (result.error) throw result.error;
  return { providerAccepted: true };
}

export function normalizeParticipantPhoneOtpToken(value) {
  const token = clean(value).replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_INVALID", participantPhoneOtpErrorMessage("PHONE_OTP_INVALID"), 400);
  }
  return token;
}

export async function verifyExistingParticipantPhoneOtp({ otpClient, phone, token, expectedAuthUserId }) {
  const result = await otpClient.auth.verifyOtp({ phone, token, type: "sms" });
  if (result.error) return { ok: false, error: result.error, userId: null, sessionCreated: false };
  return {
    ok: clean(result.data?.user?.id) === clean(expectedAuthUserId),
    error: null,
    userId: clean(result.data?.user?.id) || null,
    sessionCreated: Boolean(result.data?.session),
  };
}

export function participantPhoneOtpProviderFailureCode(error, phase = "send") {
  const status = Number(error?.status || 0);
  const code = clean(error?.code).toLowerCase();
  if (status === 429 || code.includes("rate")) return "PHONE_OTP_RATE_LIMITED";
  if (phase === "verify" && (status === 400 || status === 401 || status === 422 || code.includes("otp"))) {
    return "PHONE_OTP_INVALID_OR_EXPIRED";
  }
  return "PHONE_OTP_PROVIDER_UNAVAILABLE";
}
