import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const clean = (value) => String(value ?? "").trim();
const blank = (value) => clean(value) === "";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE = "sbi-preview-phone-login-proof";
export const PARTICIPANT_PHONE_LOGIN_PROOF_SECONDS = 10 * 60;

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
    PHONE_OTP_PENDING_STATE_MISMATCH: "Phone enrollment is not ready for code verification. Start over after the pending state is cleared.",
    PHONE_OTP_SEND_FAILED: "The phone verification code could not be sent. Email sign-in remains available.",
    PHONE_OTP_VERIFY_FAILED: "The phone verification could not be completed. Email sign-in remains available.",
    PHONE_OTP_AUTH_MISMATCH: "The verified Auth identity did not match the approved participant.",
    PHONE_OTP_AUTH_COLLISION: "This mobile number conflicts with another Auth account.",
    PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED: "This phone is not yet enabled for Preview SMS delivery. Email sign-in remains available.",
    PHONE_OTP_PROVIDER_UNAVAILABLE: "The phone verification provider is temporarily unavailable. Email sign-in remains available.",
    PHONE_OTP_CONFIGURATION_REQUIRED: "Preview phone verification is not completely configured.",
    PHONE_LOGIN_PROOF_REQUIRED: "Prepare the controlled signed-out phone login from the active email session first.",
    PHONE_LOGIN_PROOF_USED: "This controlled phone login proof has already requested a code. Sign in by email to prepare a new proof.",
    PHONE_LOGIN_DIRECTOR_PARITY_MISMATCH: "The controlled phone login stopped because Director authority changed during authentication.",
    PHONE_LOGIN_SEND_FAILED: "The phone sign-in code could not be sent. Email sign-in remains available.",
    PHONE_LOGIN_VERIFY_FAILED: "The phone sign-in could not be completed. Email sign-in remains available.",
    PHONE_LOGIN_SESSION_FAILED: "The phone was verified, but a participant session could not be established safely.",
    PHONE_LOGIN_PASSPORT_MISSING: "Phone sign-in succeeded, but the existing Player Passport could not be resolved.",
  })[clean(code).toUpperCase()] || "The controlled phone verification could not be completed.";
}

function participantPhoneLoginProofSignature(payload, secret) {
  const key = clean(secret);
  if (key.length < 32) {
    throw new ParticipantPhoneOtpError(
      "PHONE_OTP_CONFIGURATION_REQUIRED",
      participantPhoneOtpErrorMessage("PHONE_OTP_CONFIGURATION_REQUIRED"),
      503,
    );
  }
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function normalizeParticipantPhoneLoginProofPayload(input) {
  const payload = {
    version: 2,
    proofId: clean(input?.proofId),
    authUserId: clean(input?.authUserId),
    playerId: clean(input?.playerId),
    tournamentId: clean(input?.tournamentId),
    identifierId: clean(input?.identifierId),
    identifierRevision: Number(input?.identifierRevision || 0),
    directorEntitlementState: clean(input?.directorEntitlementState).toUpperCase(),
    directorRole: clean(input?.directorRole).toUpperCase(),
    directorScope: clean(input?.directorScope).toUpperCase(),
    directorEntitlementRevision: Number(input?.directorEntitlementRevision || 0),
    directorEntitlementSource: clean(input?.directorEntitlementSource).toUpperCase(),
    directorEntitlementCount: Number(input?.directorEntitlementCount ?? -1),
    directorEntitlementFingerprint: clean(input?.directorEntitlementFingerprint).toLowerCase(),
    issuedAt: Number(input?.issuedAt || 0),
    expiresAt: Number(input?.expiresAt || 0),
  };
  if (!uuidPattern.test(payload.proofId) || !uuidPattern.test(payload.authUserId) ||
      !uuidPattern.test(payload.identifierId) || !/^[A-Za-z0-9_-]{1,40}$/.test(payload.playerId) ||
      !/^[A-Za-z0-9_-]{1,40}$/.test(payload.tournamentId) ||
      !Number.isSafeInteger(payload.identifierRevision) || payload.identifierRevision < 1 ||
      !["ACTIVE", "REVOKED", "NONE"].includes(payload.directorEntitlementState) ||
      !["DIRECTOR", "NONE"].includes(payload.directorRole) ||
      !/^[A-Z0-9:_-]{1,160}$/.test(payload.directorScope) ||
      !Number.isSafeInteger(payload.directorEntitlementRevision) || payload.directorEntitlementRevision < 0 ||
      !/^(?:DIRECTOR_PASSPORT|CONTROLLED_MIGRATION|NONE)$/.test(payload.directorEntitlementSource) ||
      !Number.isSafeInteger(payload.directorEntitlementCount) || payload.directorEntitlementCount < 0 ||
      !/^[0-9a-f]{32}$/.test(payload.directorEntitlementFingerprint) ||
      !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)) {
    throw new ParticipantPhoneOtpError("PHONE_LOGIN_PROOF_REQUIRED", participantPhoneOtpErrorMessage("PHONE_LOGIN_PROOF_REQUIRED"), 401);
  }
  return payload;
}

export function createParticipantPhoneLoginProof(input, secret, { now = Date.now() } = {}) {
  const issuedAt = Math.floor(now / 1000);
  const payload = normalizeParticipantPhoneLoginProofPayload({
    ...input,
    proofId: input?.proofId || randomUUID(),
    issuedAt,
    expiresAt: issuedAt + PARTICIPANT_PHONE_LOGIN_PROOF_SECONDS,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${participantPhoneLoginProofSignature(encoded, secret)}`;
}

export function verifyParticipantPhoneLoginProof(token, secret, { now = Date.now() } = {}) {
  const [encoded, signature, extra] = clean(token).split(".");
  if (!encoded || !signature || extra) {
    throw new ParticipantPhoneOtpError("PHONE_LOGIN_PROOF_REQUIRED", participantPhoneOtpErrorMessage("PHONE_LOGIN_PROOF_REQUIRED"), 401);
  }
  const expected = Buffer.from(participantPhoneLoginProofSignature(encoded, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ParticipantPhoneOtpError("PHONE_LOGIN_PROOF_REQUIRED", participantPhoneOtpErrorMessage("PHONE_LOGIN_PROOF_REQUIRED"), 401);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch {
    throw new ParticipantPhoneOtpError("PHONE_LOGIN_PROOF_REQUIRED", participantPhoneOtpErrorMessage("PHONE_LOGIN_PROOF_REQUIRED"), 401);
  }
  const payload = normalizeParticipantPhoneLoginProofPayload(parsed);
  const current = Math.floor(now / 1000);
  if (payload.version !== 2 || payload.issuedAt > current + 30 || payload.expiresAt <= current ||
      payload.expiresAt - payload.issuedAt !== PARTICIPANT_PHONE_LOGIN_PROOF_SECONDS) {
    throw new ParticipantPhoneOtpError("PHONE_LOGIN_PROOF_REQUIRED", participantPhoneOtpErrorMessage("PHONE_LOGIN_PROOF_REQUIRED"), 401);
  }
  return payload;
}

const directorParityFields = [
  "directorEntitlementState",
  "directorRole",
  "directorScope",
  "directorEntitlementRevision",
  "directorEntitlementSource",
  "directorEntitlementCount",
  "directorEntitlementFingerprint",
];

export function participantDirectorEntitlementParity(before = {}, after = {}) {
  return directorParityFields.every((field) => clean(before[field]).toUpperCase() === clean(after[field]).toUpperCase());
}

export function participantPhoneLoginProofCookie(value, maxAge = PARTICIPANT_PHONE_LOGIN_PROOF_SECONDS) {
  return {
    name: PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE,
    value: clean(value),
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge,
  };
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

export function maskParticipantAuthPhone(value) {
  const canonical = canonicalParticipantAuthPhone(value);
  return canonical.length >= 4 ? `••• ••• ${canonical.slice(-4)}` : "Approved mobile";
}

function pendingPhoneSource(user, targetPhone, prefix) {
  const target = canonicalParticipantAuthPhone(targetPhone);
  if (!blank(user?.new_phone) && canonicalParticipantAuthPhone(user.new_phone) === target) {
    return `${prefix}_NEW_PHONE`;
  }
  if (!blank(user?.phone_change) && canonicalParticipantAuthPhone(user.phone_change) === target) {
    return `${prefix}_PHONE_CHANGE`;
  }
  return "";
}

/**
 * Canonical Stage B normalizer for Supabase's two supported pending-phone
 * representations. Auth-js exposes hosted `phone_change` as `new_phone`, while
 * database-shaped reads expose `phone_change`; both are normalized to digits
 * before comparison so an omitted leading plus does not change ownership.
 */
export function normalizeParticipantPhoneEnrollmentStageB({
  updateUser,
  persistedUser,
  expectedAuthUserId,
  expectedEmail,
  targetPhone,
  requireUpdateUser = true,
}) {
  const expectedId = clean(expectedAuthUserId);
  const users = [updateUser, persistedUser].filter(Boolean);
  if ((requireUpdateUser && !updateUser?.id) || !persistedUser?.id ||
      users.some((user) => clean(user.id) !== expectedId)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_AUTH_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"));
  }
  if (users.some((user) => user.email && clean(user.email).toLowerCase() !== clean(expectedEmail).toLowerCase())) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_ENROLLMENT_START_FAILED", participantPhoneOtpErrorMessage("PHONE_OTP_ENROLLMENT_START_FAILED"));
  }
  const states = users.map((user) => inspectParticipantAuthUserPhone(user, targetPhone));
  if (states.some((state) => state.phoneState !== "EMPTY" || state.phoneConfirmed || state.phoneChangeState === "CONFLICT")) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_PENDING_STATE_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_PENDING_STATE_MISMATCH"));
  }
  const source = pendingPhoneSource(updateUser, targetPhone, "UPDATE_USER") ||
    pendingPhoneSource(persistedUser, targetPhone, "ADMIN_USER");
  if (!source) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_PENDING_STATE_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_PENDING_STATE_MISMATCH"));
  }
  return {
    authUserId: expectedId,
    pendingPhoneMatches: true,
    pendingPhoneSource: source,
    phoneRepresentationNormalized: true,
  };
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
    throw new ParticipantPhoneOtpError("PHONE_OTP_ENROLLMENT_START_FAILED", participantPhoneOtpErrorMessage("PHONE_OTP_ENROLLMENT_START_FAILED"));
  }
  const state = inspectParticipantAuthUserPhone(user, targetPhone);
  if (state.phoneChangeState === "CONFLICT" || state.phoneState === "CONFLICT") {
    const code = phase === "verified" ? "PHONE_OTP_VERIFY_FAILED" : "PHONE_OTP_PENDING_STATE_MISMATCH";
    throw new ParticipantPhoneOtpError(code, participantPhoneOtpErrorMessage(code));
  }
  if (phase === "before" && state.phoneState !== "EMPTY") {
    throw new ParticipantPhoneOtpError("PHONE_OTP_REPAIR_REQUIRED", participantPhoneOtpErrorMessage("PHONE_OTP_REPAIR_REQUIRED"));
  }
  if (phase === "pending" && (state.phoneState !== "EMPTY" || state.phoneChangeState !== "EXPECTED" || state.phoneConfirmed)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_PENDING_STATE_MISMATCH", participantPhoneOtpErrorMessage("PHONE_OTP_PENDING_STATE_MISMATCH"));
  }
  if (phase === "verified" && (state.phoneState !== "EXPECTED" || state.phoneChangeState !== "EMPTY" || !state.phoneConfirmed)) {
    throw new ParticipantPhoneOtpError("PHONE_OTP_VERIFY_FAILED", participantPhoneOtpErrorMessage("PHONE_OTP_VERIFY_FAILED"));
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
    user: result.data?.user || null,
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
  if (result.error) return { ok: false, error: result.error, userId: null, sessionCreated: false, refreshSessionAvailable: false };
  return {
    ok: clean(result.data?.user?.id) === clean(expectedAuthUserId),
    error: null,
    userId: clean(result.data?.user?.id) || null,
    sessionCreated: Boolean(result.data?.session),
    refreshSessionAvailable: Boolean(result.data?.session?.refresh_token),
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
