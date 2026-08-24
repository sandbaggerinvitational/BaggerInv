const PARTICIPANT_EMAIL_OTP_VERIFICATION_TYPES = new Set(["signup", "email"]);

export function resolveParticipantEmailOtpVerificationType(value, {
  required = false,
} = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (PARTICIPANT_EMAIL_OTP_VERIFICATION_TYPES.has(normalized)) return normalized;
  // Preview's already-certified RPC predates persisted verification types and
  // always uses the ordinary email sign-in contract. Production candidates
  // must never guess: the database-bound attempt type is mandatory there.
  if (!required && !normalized) return "email";
  const error = new Error("Participant email OTP verification-type configuration is unavailable.");
  error.code = "PARTICIPANT_EMAIL_OTP_VERIFICATION_TYPE_CONFIGURATION_REQUIRED";
  throw error;
}

export async function requestParticipantEmailOtp(authClient, {
  email,
  captchaToken,
  verificationType,
}) {
  const type = resolveParticipantEmailOtpVerificationType(verificationType, { required: true });
  const options = captchaToken ? { captchaToken } : {};
  if (type === "signup") {
    return authClient.auth.resend({ type: "signup", email, options });
  }
  return authClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, ...options },
  });
}
