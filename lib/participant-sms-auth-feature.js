const enabled = (value) => /^(true|yes|1|enabled)$/i.test(String(value ?? "").trim());

/**
 * Reserved for Step 8B.2+. Step 8B.1 never consumes this flag in participant
 * UI, so SMS login remains absent even if an environment is misconfigured.
 */
export function participantSmsAuthFeatureConfigured(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_AUTH_ENABLED);
}

/** Director-only provider proof. It never exposes participant SMS login. */
export function participantSmsProviderTestConfigured(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_PROVIDER_TEST_ENABLED) &&
    !participantSmsAuthFeatureConfigured(env);
}
