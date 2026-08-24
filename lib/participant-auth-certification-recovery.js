export async function recordOtpVerificationWithRecovery(input, {
  recordVerification,
  attempts = 3,
} = {}) {
  if (typeof recordVerification !== "function") {
    throw new TypeError("A Production Auth certification recorder is required.");
  }
  const boundedAttempts = Math.max(1, Math.min(3, Number(attempts) || 1));
  let lastError = null;
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    try { return await recordVerification(input); }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error("Production Auth certification could not be recorded.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function productionAuthRecoveryReference({ requestId, authUserId } = {}) {
  const request = String(requestId || "").trim();
  const user = String(authUserId || "").trim();
  if (!UUID.test(request) || !UUID.test(user)) {
    const error = new Error("An exact Production Auth request and Auth user are required for recovery.");
    error.code = "PRODUCTION_AUTH_RECOVERY_EXACT_REQUEST_REQUIRED";
    throw error;
  }
  return Object.freeze({ requestId: request.toLowerCase(), authUserId: user.toLowerCase() });
}
