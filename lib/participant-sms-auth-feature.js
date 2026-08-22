const enabled = (value) => /^(true|yes|1|enabled)$/i.test(String(value ?? "").trim());
const clean = (value) => String(value ?? "").trim();

export const PARTICIPANT_SMS_PREVIEW_ROLLOUTS = Object.freeze({
  DESIGNATED: "DESIGNATED",
  VERIFIED: "VERIFIED",
});

export function participantAuthCaptchaConfigured(env = process.env) {
  return clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_CAPTCHA_REQUIRED) &&
    enabled(env.PARTICIPANT_SMS_CAPTCHA_CONFIGURED) &&
    Boolean(clean(env.NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY));
}

export function participantSmsRateLimitConfigured(env = process.env) {
  return clean(env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET).length >= 32;
}

export function participantSmsPreviewRollout(env = process.env) {
  const requested = clean(env.PARTICIPANT_SMS_PREVIEW_ROLLOUT).toUpperCase();
  return requested === PARTICIPANT_SMS_PREVIEW_ROLLOUTS.VERIFIED
    ? PARTICIPANT_SMS_PREVIEW_ROLLOUTS.VERIFIED
    : PARTICIPANT_SMS_PREVIEW_ROLLOUTS.DESIGNATED;
}

/**
 * Reserved for Step 8B.2+. Step 8B.1 never consumes this flag in participant
 * UI, so SMS login remains absent even if an environment is misconfigured.
 */
export function participantSmsAuthFeatureConfigured(env = process.env) {
  return clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_AUTH_ENABLED) &&
    participantAuthCaptchaConfigured(env) &&
    participantSmsRateLimitConfigured(env);
}

export function participantAuthExperienceConfiguration(env = process.env) {
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const smsRequested = preview && enabled(env.PARTICIPANT_SMS_AUTH_ENABLED);
  const captchaReady = participantAuthCaptchaConfigured(env);
  const rateLimitReady = participantSmsRateLimitConfigured(env);
  const smsEnabled = smsRequested && captchaReady && rateLimitReady;
  return {
    preview,
    smsRequested,
    smsEnabled,
    captchaRequired: captchaReady,
    captchaReady,
    rateLimitReady,
    captchaSiteKey: captchaReady ? clean(env.NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY) : "",
    defaultMethod: smsEnabled ? "phone" : "email",
    rollout: participantSmsPreviewRollout(env),
    productionBlocked: clean(env.VERCEL_ENV).toLowerCase() === "production",
  };
}

/** Director-only provider proof. It never exposes participant SMS login. */
export function participantSmsProviderTestConfigured(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_PROVIDER_TEST_ENABLED) &&
    !participantSmsAuthFeatureConfigured(env);
}
