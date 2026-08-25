import { participantIdentityAuthorityEnvironment } from "./participant-identity-authority.js";

const enabled = (value) => /^(true|yes|1|enabled)$/i.test(String(value ?? "").trim());
const clean = (value) => String(value ?? "").trim();

function productionShadowCandidateRequested(env) {
  return enabled(env.PRODUCTION_SHADOW_CANDIDATE_ENABLED);
}

function productionShadowCandidateSmsCertified(env) {
  return productionShadowCandidateRequested(env) &&
    enabled(env.PRODUCTION_SHADOW_CANDIDATE_SMS_CERTIFIED_ENABLED);
}

function participantAuthCaptchaNamespaceRequested(env) {
  return productionShadowCandidateRequested(env) || (
    clean(env.VERCEL_ENV).toLowerCase() === "production" &&
    enabled(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED)
  );
}

function captchaRequirementRequested(env) {
  return participantAuthCaptchaNamespaceRequested(env)
    ? enabled(env.PARTICIPANT_AUTH_CAPTCHA_REQUIRED)
    : enabled(env.PARTICIPANT_SMS_CAPTCHA_REQUIRED);
}

function captchaConfigurationAcknowledged(env) {
  return participantAuthCaptchaNamespaceRequested(env)
    ? enabled(env.PARTICIPANT_AUTH_CAPTCHA_CONFIGURED)
    : enabled(env.PARTICIPANT_SMS_CAPTCHA_CONFIGURED);
}

function captchaSiteKey(env) {
  return participantAuthCaptchaNamespaceRequested(env)
    ? clean(env.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY)
    : clean(env.NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY);
}

export const PARTICIPANT_SMS_PREVIEW_ROLLOUTS = Object.freeze({
  DESIGNATED: "DESIGNATED",
  VERIFIED: "VERIFIED",
});

export function participantAuthCaptchaConfigured(env = process.env) {
  const identity = participantIdentityAuthorityEnvironment(env);
  const supportedRuntime = clean(env.VERCEL_ENV).toLowerCase() === "preview" ||
    identity.productionCutoverIdentity;
  return supportedRuntime &&
    captchaRequirementRequested(env) &&
    captchaConfigurationAcknowledged(env) &&
    Boolean(captchaSiteKey(env));
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
  const candidateRequested = productionShadowCandidateRequested(env);
  return clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_AUTH_ENABLED) &&
    (!candidateRequested || productionShadowCandidateSmsCertified(env)) &&
    participantAuthCaptchaConfigured(env) &&
    participantSmsRateLimitConfigured(env);
}

export function participantAuthExperienceConfiguration(env = process.env) {
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const identity = participantIdentityAuthorityEnvironment(env);
  const productionCutoverIdentity = identity.productionCutoverIdentity;
  const candidateRequested = productionShadowCandidateRequested(env);
  const candidateSmsCertified = productionShadowCandidateSmsCertified(env);
  const smsRequested = preview && enabled(env.PARTICIPANT_SMS_AUTH_ENABLED) &&
    (!candidateRequested || candidateSmsCertified);
  const captchaRequired = (preview || productionCutoverIdentity) && captchaRequirementRequested(env);
  const captchaReady = participantAuthCaptchaConfigured(env);
  const rateLimitReady = participantSmsRateLimitConfigured(env);
  const smsEnabled = smsRequested && captchaReady && rateLimitReady;
  return {
    preview,
    smsRequested,
    smsEnabled,
    candidateSmsCertified,
    // Required and ready are intentionally separate. A missing site key may
    // never turn a required CAPTCHA into an unprotected OTP request.
    captchaRequired,
    captchaReady,
    rateLimitReady,
    captchaSiteKey: captchaReady ? captchaSiteKey(env) : "",
    defaultMethod: smsEnabled ? "phone" : "email",
    rollout: participantSmsPreviewRollout(env),
    productionBlocked: clean(env.VERCEL_ENV).toLowerCase() === "production" && !productionCutoverIdentity,
  };
}

/** Director-only provider proof. It never exposes participant SMS login. */
export function participantSmsProviderTestConfigured(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview" &&
    enabled(env.PARTICIPANT_SMS_PROVIDER_TEST_ENABLED) &&
    (!productionShadowCandidateRequested(env) || productionShadowCandidateSmsCertified(env)) &&
    !participantSmsAuthFeatureConfigured(env);
}
