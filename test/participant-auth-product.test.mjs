import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  participantAuthCaptchaConfigured,
  participantAuthExperienceConfiguration,
  participantSmsAuthFeatureConfigured,
} from "../lib/participant-sms-auth-feature.js";
import {
  classifyParticipantPhoneOtpProviderFailure,
  normalizeParticipantAuthCaptchaToken,
  participantPhoneOtpIdentifierFingerprint,
  requestExistingParticipantPhoneLogin,
} from "../lib/participant-phone-otp.js";
import {
  participantAuthEntryValidation,
  participantAuthErrorPresentation,
  participantAuthFieldAttributes,
} from "../lib/participant-auth-error-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readyPreview = {
  VERCEL_ENV: "preview",
  PARTICIPANT_SMS_AUTH_ENABLED: "true",
  PARTICIPANT_SMS_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_SMS_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY: "preview-public-site-key",
  PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET: "preview-rate-limit-secret-at-least-32-characters",
  PARTICIPANT_SMS_PREVIEW_ROLLOUT: "DESIGNATED",
};

test("SMS is Preview-only and fails closed until Turnstile configuration is acknowledged", () => {
  assert.equal(participantSmsAuthFeatureConfigured(readyPreview), true);
  assert.equal(participantAuthCaptchaConfigured(readyPreview), true);
  assert.equal(participantSmsAuthFeatureConfigured({ ...readyPreview, VERCEL_ENV: "production" }), false);
  assert.equal(participantSmsAuthFeatureConfigured({ ...readyPreview, PARTICIPANT_SMS_CAPTCHA_CONFIGURED: "false" }), false);
  assert.equal(participantSmsAuthFeatureConfigured({ ...readyPreview, NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY: "" }), false);
  assert.equal(participantSmsAuthFeatureConfigured({ ...readyPreview, PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET: "short" }), false);
  assert.deepEqual(participantAuthExperienceConfiguration({ ...readyPreview, PARTICIPANT_SMS_CAPTCHA_CONFIGURED: "false" }), {
    preview: true,
    smsRequested: true,
    smsEnabled: false,
    captchaRequired: false,
    captchaReady: false,
    rateLimitReady: true,
    captchaSiteKey: "",
    defaultMethod: "email",
    rollout: "DESIGNATED",
    productionBlocked: false,
  });
});

test("final signed-out UI is text-first, locally switchable, accessible, and free of engineering jargon", async () => {
  const ui = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  for (const copy of ["Welcome to The Bagger", "Sign in to access your tournament.", "Mobile Number",
    "(###) ###-####", "Text Me a Code", "Use Email Instead", "Send Me a Code", "Use Mobile Instead",
    "Enter your code", "Use a different number", "Opening The Bagger…"]) assert.match(ui, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ui, /type="tel" inputMode="tel" autoComplete="tel"/);
  assert.match(ui, /type="email" inputMode="email" autoComplete="email"/);
  assert.match(ui, /inputMode="numeric" autoComplete="one-time-code"/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /onSubmit=\{requestPhoneCode\}/);
  assert.match(ui, /onSubmit=\{requestEmailCode\}/);
  assert.match(ui, /onSubmit=\{verifyCode\}/);
  assert.doesNotMatch(ui, /Operation A|Operation B|Controlled Preview|Rehearsal mobile|Supabase email session|Auth UUID|Player Passport|phone_change|Identity authority|Scoring authority|server transaction/i);
});

test("trusted session stays behind a startup state and redirects without showing the login form", async () => {
  const ui = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.match(ui, /sessionState === "checking" \|\| authTransition/);
  assert.match(ui, /Getting things ready…/);
  assert.match(ui, /payload\.session === "active" && payload\.linkedPlayerId/);
  assert.match(ui, /rememberParticipantAuthNavigation\(location\.pathname, next, "SESSION_RESTORE"\)/);
  assert.match(ui, /router\.replace\(next\)/);
});

test("safe next destinations are internal participant routes only", async () => {
  const ui = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.match(ui, /\^\\\/(?:\(\?:)?home\|my-match\|score\|live\|me/);
  assert.match(ui, /\? requestedNext : "\/home"/);
  assert.doesNotMatch(ui, /window\.location\s*=|location\.href\s*=/);
});

test("Turnstile is auth-route-only and sends one-time tokens to Supabase Auth", async () => {
  const [widget, phoneRoute, emailRoute, helper, env] = await Promise.all([
    source("app/participant-auth/ParticipantAuthTurnstile.js"),
    source("app/api/participant/auth/phone/route.js"),
    source("app/api/participant/auth/otp/request/route.js"),
    source("lib/participant-phone-otp.js"),
    source(".env.example"),
  ]);
  assert.match(widget, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(widget, /appearance: "always"/);
  assert.match(widget, /onReady=/);
  assert.match(widget, /onError=/);
  assert.match(widget, /Request verification could not load/);
  assert.match(widget, /expired-callback/);
  assert.match(phoneRoute, /normalizeParticipantAuthCaptchaToken/);
  assert.match(emailRoute, /normalizeParticipantAuthCaptchaToken/);
  assert.match(helper, /shouldCreateUser: false, channel: "sms", \.\.\.\(captchaToken \? \{ captchaToken \}/);
  assert.match(emailRoute, /captchaToken \? \{ captchaToken \}/);
  assert.match(env, /NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY=/);
  assert.doesNotMatch(env, /TURNSTILE_SECRET|CLOUDFLARE_SECRET/);
});

test("OTP sends stay disabled until the visible Turnstile control yields a token", async () => {
  const ui = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.match(ui, /const captchaPending = experience\.captchaRequired && !captchaToken/);
  assert.match(ui, /disabled=\{Boolean\(busy\) \|\| captchaPending \|\| phone\.replace/);
  assert.match(ui, /disabled=\{Boolean\(busy\) \|\| captchaPending \|\| !email\.trim\(\)\}/);
  assert.match(ui, /onClick=\{resendCode\} disabled=\{Boolean\(busy\) \|\| captchaPending\}/);
});

test("successful Turnstile callback forwards one token exactly once to the Supabase phone Auth boundary", async () => {
  const calls = [];
  const captchaToken = "mock-turnstile-token-that-is-never-routable";
  const authClient = { auth: { signInWithOtp: async (input) => {
    calls.push(input);
    return { data: {}, error: null };
  } } };

  const result = await requestExistingParticipantPhoneLogin({
    authClient,
    phone: "+12025550123",
    captchaToken,
  });

  assert.equal(result.providerAccepted, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    phone: "+12025550123",
    options: { shouldCreateUser: false, channel: "sms", captchaToken },
  });
});

test("the hosted captcha_failed response is classified before provider work", () => {
  assert.deepEqual(classifyParticipantPhoneOtpProviderFailure({
    code: "captcha_failed",
    status: 400,
    message: "captcha protection: request disallowed",
  }, "send"), {
    code: "PHONE_OTP_CAPTCHA_FAILED",
    authErrorCode: "captcha_failed",
    authStatus: 400,
    providerErrorClass: "CAPTCHA_REJECTED",
    providerCalled: false,
  });
});

test("valid phone request failures show an error card without invalidating the field", () => {
  assert.equal(participantAuthEntryValidation("phone", "(202) 555-0123"), null);
  for (const [category, message] of [
    ["RATE_LIMITED", "Too many attempts. Wait a few minutes or use email instead."],
    ["REQUEST_CHECK_FAILED", "We couldn't verify this request. Try again."],
    ["TEXT_UNAVAILABLE", "Text sign-in is temporarily unavailable. Use email instead."],
    ["", "Connection lost. Try again."],
    ["ELIGIBILITY_SAFE", "If that mobile number is approved, a code will arrive shortly."],
    ["SIGN_IN_FAILED", "We couldn't complete that request. Try again."],
  ]) {
    const presentation = participantAuthErrorPresentation({ method: "phone", category, message });
    assert.equal(presentation.field, "");
    assert.equal(presentation.showErrorCard, true);
    assert.deepEqual(participantAuthFieldAttributes("phone", presentation.field), {
      "aria-invalid": undefined,
      "aria-describedby": undefined,
    });
  }
});

test("phone and email field validation alone controls red styling and aria-invalid", () => {
  const invalidPhone = participantAuthEntryValidation("phone", "202-55");
  assert.deepEqual(invalidPhone, { field: "phone", message: "Enter a valid mobile number." });
  assert.deepEqual(participantAuthFieldAttributes("phone", invalidPhone.field), {
    "aria-invalid": "true",
    "aria-describedby": "auth-error",
  });
  const serverInvalidPhone = participantAuthErrorPresentation({
    method: "phone", category: "INVALID_PHONE", message: "Enter a valid mobile number.",
  });
  assert.equal(serverInvalidPhone.field, "phone");

  assert.equal(participantAuthEntryValidation("email", "golfer@example.com"), null);
  const emailRequestFailure = participantAuthErrorPresentation({
    method: "email", category: "REQUEST_CHECK_FAILED", message: "We couldn't verify this request. Try again.",
  });
  assert.equal(emailRequestFailure.field, "");
  assert.equal(emailRequestFailure.showErrorCard, true);
  assert.equal(participantAuthFieldAttributes("email", emailRequestFailure.field)["aria-invalid"], undefined);
  const invalidEmail = participantAuthEntryValidation("email", "golfer-at-example");
  assert.deepEqual(invalidEmail, { field: "email", message: "Enter a valid email address." });
  assert.equal(participantAuthFieldAttributes("email", invalidEmail.field)["aria-invalid"], "true");
});

test("the final UI binds field attributes to validation scope and resets consumed CAPTCHA tokens", async () => {
  const [ui, css] = await Promise.all([
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
    source("app/participant-auth/participant-auth.module.css"),
  ]);
  assert.match(ui, /participantAuthFieldAttributes\("phone", fieldError\)/);
  assert.match(ui, /participantAuthFieldAttributes\("email", fieldError\)/);
  assert.match(ui, /participantAuthFieldAttributes\("code", fieldError\)/);
  assert.match(ui, /role="alert"/);
  assert.match(css, /input\[aria-invalid="true"\]/);
  assert.doesNotMatch(css, /input:invalid/);
  assert.match(ui, /catch \(requestError\) \{[\s\S]*?participantAuthErrorPresentation\([\s\S]*?setFieldError\(presentation\.field\)/);
  assert.match(ui, /catch \(resendError\) \{\s*setFieldError\(""\);[\s\S]*?resetCaptcha\(\)/);
  assert.match(ui, /const switchMethod = async[\s\S]*?clearFeedback\(\);\s*resetCaptcha\(\)/);
});

test("CAPTCHA tokens and identifier fingerprints are bounded without exposing raw values", () => {
  assert.equal(normalizeParticipantAuthCaptchaToken("a".repeat(30)), "a".repeat(30));
  assert.throws(() => normalizeParticipantAuthCaptchaToken("short"));
  assert.throws(() => normalizeParticipantAuthCaptchaToken(`bad token ${"x".repeat(30)}`));
  const fingerprint = participantPhoneOtpIdentifierFingerprint("+12025550123", "s".repeat(32));
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(fingerprint, /202|0123/);
});

test("public phone send normalizes server-side, is CAPTCHA-gated, and never trusts ownership from the client", async () => {
  const route = await source("app/api/participant/auth/phone/route.js");
  assert.match(route, /normalizeParticipantAuthPhone\(input\.phone\)/);
  assert.match(route, /rollout_mode: feature\.rollout/);
  assert.match(route, /authorizeParticipantPhoneLoginRequest/);
  assert.match(route, /beginParticipantPhonePublicRequest/);
  assert.match(route, /requestExistingParticipantPhoneLogin/);
  assert.match(route, /provider_called: true/);
  assert.doesNotMatch(route, /input\.(?:playerId|authUserId|identifierId|tournamentId)/);
  assert.doesNotMatch(route, /createUser|updateUser\(\{\s*phone|admin\.updateUserById/);
});

test("unknown phone receives a generic pending response without reaching provider send", async () => {
  const route = await source("app/api/participant/auth/phone/route.js");
  const unknown = route.slice(route.indexOf("if (authorization.allowed !== true)"), route.indexOf("// The shared send helper"));
  assert.match(unknown, /status: "VERIFICATION_PENDING"/);
  assert.match(unknown, /randomUUID\(\)/);
  assert.match(unknown, /genericRequestMessage/);
  assert.doesNotMatch(unknown, /requestExistingParticipantPhoneLogin|signInWithOtp|createUser/);
  const decoyResend = route.slice(route.indexOf("catch {\n        // Preserve the same externally visible"), route.indexOf("const currentRead"));
  assert.match(decoyResend, /beginParticipantPhonePublicRequest|publicRateLimit/);
  assert.match(decoyResend, /randomUUID\(\)/);
  assert.doesNotMatch(decoyResend, /requestExistingParticipantPhoneLogin|signInWithOtp/);
});

test("verification rechecks current ownership, hard-gates Auth UUID, and creates no ownership or scoring revision", async () => {
  const [route, migration] = await Promise.all([
    source("app/api/participant/auth/phone/route.js"),
    source("supabase/migrations/202608220001_preview_participant_sms_login_product.sql"),
  ]);
  assert.match(route, /authorizeParticipantPhoneLoginVerification/);
  assert.match(route, /expectedAuthUserId: proof\.authUserId/);
  assert.match(route, /completeParticipantPhoneLogin/);
  assert.match(route, /completion\.playerId !== proof\.playerId/);
  assert.match(route, /completion\.directorEntitlementPreserved !== true/);
  assert.match(route, /completion\.scoringAuthorizationUnchanged !== true/);
  assert.match(migration, /status <> 'VERIFIED'/);
  assert.match(migration, /verification_source is distinct from 'SUPABASE_AUTH_TWILIO_VERIFY'/);
  assert.match(migration, /membership\.participation_status = 'ACTIVE'/);
  assert.match(migration, /phone_identity_count <> 1/);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users|update\s+auth\.users|delete\s+from\s+auth\.users/i);
  assert.doesNotMatch(migration, /(?:insert\s+into|update|delete\s+from)\s+participant_identity\.user_player_links/i);
  assert.doesNotMatch(migration, /update\s+scoring_authority\.scoring_permissions/i);
});

test("resend, method change, stale ownership, and replay remain bounded", async () => {
  const [ui, route, migration] = await Promise.all([
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
    source("app/api/participant/auth/phone/route.js"),
    source("supabase/migrations/202608220001_preview_participant_sms_login_product.sql"),
  ]);
  assert.match(ui, /resendSeconds/);
  assert.match(ui, /action: "cancel"/);
  assert.match(ui, /action: "resend"/);
  assert.match(route, /cancelParticipantPhoneLogin/);
  assert.match(migration, /PARTICIPANT_CHANGED_AUTH_METHOD/);
  assert.match(migration, /interval '60 seconds'/);
  assert.match(migration, /recent_client < 6 and recent_identifier < 3/);
});

test("auth form CSS is mobile-first, bounded on wide screens, and uses touch-sized controls", async () => {
  const css = await source("app/participant-auth/participant-auth.module.css");
  assert.match(css, /width: min\(100%, 430px\)/);
  assert.match(css, /min-height: 52px/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.doesNotMatch(css, /width:\s*[5-9][0-9]{2}px/);
});

test("service worker never caches auth navigations or deployment-scoped Next chunks", async () => {
  const sw = await source("public/sw.js");
  assert.match(sw, /url\.pathname\.startsWith\("\/_next\/"\)\) return/);
  assert.match(sw, /request\.mode === "navigate"[\s\S]*fetch\(request\)\.catch/);
  assert.doesNotMatch(sw, /caches\.put\(request[^)]*participant-auth/);
});

test("participant auth source and serialized configuration contain no phone directory or secrets", async () => {
  const [ui, page, config, route] = await Promise.all([
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
    source("app/participant-auth/page.js"),
    source("lib/participant-sms-auth-feature.js"),
    source("app/api/participant/auth/phone/route.js"),
  ]);
  assert.doesNotMatch(`${ui}\n${page}\n${config}`, /SUPABASE_SCORING_MIRROR_SECRET_KEY|service.role|TWILIO_AUTH_TOKEN|normalized_value_private/i);
  assert.doesNotMatch(route, /console\.(?:log|warn|error)\([^\n]*(?:input\.phone|phoneE164|captchaToken|token)/i);
  assert.doesNotMatch(route, /access_token|refresh_token/);
});

test("email request and verify retain same-origin, no-store, no-create, and CAPTCHA protections", async () => {
  const [requestRoute, verifyRoute] = await Promise.all([
    source("app/api/participant/auth/otp/request/route.js"),
    source("app/api/participant/auth/otp/verify/route.js"),
  ]);
  for (const route of [requestRoute, verifyRoute]) {
    assert.match(route, /sameOriginMutation\(request\)/);
    assert.match(route, /private, no-store/);
  }
  assert.match(requestRoute, /shouldCreateUser: false/);
  assert.match(requestRoute, /captchaToken/);
  assert.match(verifyRoute, /data\?\.user\?\.id === allowed\.payload\.authUserId/);
});

test("operator runbook documents certified Preview auth, email-only rollback, and separate Production readiness", async () => {
  const runbook = await source("docs/participant-sms-auth-runbook.md");
  for (const requirement of ["PARTICIPANT_SMS_AUTH_ENABLED=true", "DESIGNATED", "Cloudflare Turnstile",
    "PARTICIPANT_SMS_AUTH_ENABLED=false", "Twilio account is upgraded", "Primary Compliance Profile is approved",
    "Future Production checklist", "legacy `/activate`"]) assert.match(runbook, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(runbook, /Authentication → Bot and Abuse\s+Protection/i);
  assert.doesNotMatch(runbook, /sk_live|service_role\s*=|auth token\s*=|secret key:\s*\S+/i);
});

test("global install prompt does not cover participant auth actions", async () => {
  const pwa = await source("app/PwaFoundation.js");
  assert.match(pwa, /\["\/home", "\/participant-auth"\]\.includes/);
});
