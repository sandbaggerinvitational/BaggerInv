import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import {
  MOBILE_API_VERSION,
  MobileApiError,
  requireMobileApiAvailable,
} from "./mobile-api-v1.js";
import {
  mobileBearerTokenFromRequest,
  verifyMobileSupabaseAuthenticatedUser,
} from "./mobile-bearer-identity.js";
import {
  classifyParticipantEmailOtpAuthError,
  participantAuthClientRequestHash,
  participantAuthEmailHash,
  participantAuthGenericMessage,
  participantAuthRateLimitSecret,
} from "./participant-auth-rehearsal.js";
import { authorizeParticipantEmailOtpEligibility } from "./participant-email-otp-authorization.js";
import {
  requestParticipantEmailOtp,
  resolveParticipantEmailOtpVerificationType,
} from "./participant-email-otp-mode.js";
import { recordOtpVerificationWithRecovery } from "./participant-auth-certification-recovery.js";
import {
  authorizeSingleParticipantOtpVerification,
  readParticipantIdentityContextForAuth,
  recordSingleParticipantOtpDelivery,
  recordSingleParticipantOtpVerification,
} from "./participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "./supabase-auth-server.js";
import { dataAuthorityFetch } from "./data-authority-request.js";
import { consumeRateLimit } from "./rate-limit.js";
import { normalizeParticipantAuthCaptchaToken } from "./participant-phone-otp.js";
import {
  MOBILE_NATIVE_CERTIFICATION_SECONDS,
  issueMobileNativeCertification,
} from "./mobile-native-certification.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const REQUEST_KEYS = new Set(["method", "identifier", "captchaToken"]);
const CERTIFICATION_KEYS = new Set(["challengeId"]);

export const MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE = "supabase-turnstile";
export const MOBILE_NATIVE_OTP_CHALLENGE_SECONDS = 15 * 60;
export const MOBILE_NATIVE_OTP_RESEND_SECONDS = 60;
export const MOBILE_NATIVE_OTP_PUBLIC_MINIMUM_MS = 750;
export const MOBILE_NATIVE_AUTH_MAX_BODY_BYTES = 8 * 1024;
export const MOBILE_NATIVE_OTP_CLIENT_LIMIT = 5;
export const MOBILE_NATIVE_OTP_CLIENT_WINDOW_MS = 15 * 60 * 1_000;
export const MOBILE_NATIVE_CERTIFICATION_CLIENT_LIMIT = 8;
export const MOBILE_NATIVE_CERTIFICATION_CLIENT_WINDOW_MS = 15 * 60 * 1_000;

async function readBoundedBody(request, maxBytes) {
  let reader;
  try { reader = request?.body?.getReader?.(); }
  catch { throw new MobileApiError("INVALID_AUTH_REQUEST"); }
  if (!reader) throw new MobileApiError("INVALID_AUTH_REQUEST");

  const chunks = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("Unexpected request body chunk.");
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new MobileApiError("INVALID_AUTH_REQUEST");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError("INVALID_AUTH_REQUEST");
  }
  if (totalBytes === 0) throw new MobileApiError("INVALID_AUTH_REQUEST");

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { throw new MobileApiError("INVALID_AUTH_REQUEST"); }
}

export async function readMobileNativeAuthJson(request, {
  maxBytes = MOBILE_NATIVE_AUTH_MAX_BODY_BYTES,
} = {}) {
  const contentType = clean(request?.headers?.get?.("content-type")).split(";", 1)[0].toLowerCase();
  const contentLengthValue = clean(request?.headers?.get?.("content-length"));
  const contentLength = contentLengthValue ? Number(contentLengthValue) : null;
  if (contentType !== "application/json" ||
      (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > maxBytes))) {
    throw new MobileApiError("INVALID_AUTH_REQUEST");
  }
  const raw = await readBoundedBody(request, maxBytes);
  try { return JSON.parse(raw); }
  catch { throw new MobileApiError("INVALID_AUTH_REQUEST"); }
}

function html(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

export function mobileNativeCaptchaPage(env = process.env) {
  requireNativeAuthEnvironment(env);
  const siteKey = clean(env.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(siteKey)) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  const nonce = randomBytes(18).toString("base64url");
  const content = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>Bagger request verification</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07130d; color: #f5f7f5; }
    main { width: min(92vw, 360px); text-align: center; }
    #challenge { min-height: 70px; display: grid; place-items: center; }
    p { font-size: 15px; line-height: 1.4; color: #c9d4cc; }
  </style>
  <script nonce="${nonce}">
    window.baggerTurnstileReady = function () {
      window.turnstile.render("#challenge", {
        sitekey: "${html(siteKey)}",
        action: "mobile_native_otp",
        callback: function (token) {
          var bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.baggerTurnstile;
          if (bridge) bridge.postMessage({ token: token });
          document.getElementById("status").textContent = "Request verified. Return to The Bagger.";
        },
        "expired-callback": function () {
          document.getElementById("status").textContent = "Verification expired. Try again.";
        },
        "error-callback": function () {
          document.getElementById("status").textContent = "Verification could not load. Try again.";
        }
      });
    };
  </script>
  <script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=baggerTurnstileReady&render=explicit" async defer></script>
</head>
<body>
  <main>
    <div id="challenge" aria-label="Request verification"></div>
    <p id="status" aria-live="polite">Complete verification to request your sign-in code.</p>
  </main>
</body>
</html>`;
  return {
    status: 200,
    body: content,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'nonce-${nonce}'; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex",
    },
  };
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function requireNativeAuthEnvironment(env) {
  const state = requireMobileApiAvailable(env);
  if (clean(env.MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE).toLowerCase() !== MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  return state;
}

function parseRequestInput(input) {
  if (!hasOnlyKeys(input, REQUEST_KEYS)) throw new MobileApiError("INVALID_AUTH_REQUEST");
  const method = clean(input.method).toLowerCase();
  if (!method || !["email", "phone"].includes(method)) throw new MobileApiError("INVALID_AUTH_REQUEST");
  if (method !== "email") throw new MobileApiError("AUTH_METHOD_UNAVAILABLE");
  const identifier = clean(input.identifier).toLowerCase();
  if (!identifier || identifier.length > 320) throw new MobileApiError("INVALID_AUTH_REQUEST");
  let captchaToken = "";
  try { captchaToken = normalizeParticipantAuthCaptchaToken(input.captchaToken); }
  catch { throw new MobileApiError("INVALID_AUTH_REQUEST"); }
  return { method, identifier, captchaToken };
}

function parseCertificationInput(input) {
  if (!hasOnlyKeys(input, CERTIFICATION_KEYS)) throw new MobileApiError("INVALID_AUTH_REQUEST");
  const challengeId = clean(input.challengeId).toLowerCase();
  if (!UUID.test(challengeId)) throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  return { challengeId };
}

function requestClientFingerprint(request, env) {
  const forwarded = clean(request?.headers?.get?.("x-forwarded-for")).split(",")[0].trim();
  const userAgent = clean(request?.headers?.get?.("user-agent"));
  return participantAuthClientRequestHash(`${forwarded}|${userAgent}`, {
    secret: participantAuthRateLimitSecret(env),
  });
}

function requestResponse(challengeId) {
  return {
    status: 202,
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data: {
        accepted: true,
        method: "email",
        verificationType: "email",
        challengeId,
        expiresInSeconds: MOBILE_NATIVE_OTP_CHALLENGE_SECONDS,
        resendAfterSeconds: MOBILE_NATIVE_OTP_RESEND_SECONDS,
        message: participantAuthGenericMessage(),
      },
    },
  };
}

async function waitForEnumerationFloor(startedAt, {
  now = () => performance.now(),
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  minimumDurationMs = MOBILE_NATIVE_OTP_PUBLIC_MINIMUM_MS,
} = {}) {
  const remaining = Math.max(0, Number(minimumDurationMs) - Math.round(now() - startedAt));
  if (remaining > 0) await delay(remaining);
}

function createOtpDeliveryClient(env) {
  const config = participantAuthServerConfiguration(env);
  if (!config.configured) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: dataAuthorityFetch("supabase", { adapter: "mobile-native-email-otp-request" }) },
  });
}

export async function requestMobileNativeOtp({
  request,
  input,
  env = process.env,
  dependencies = {},
} = {}) {
  requireNativeAuthEnvironment(env);
  const startedAt = (dependencies.now || (() => performance.now()))();
  const parsed = parseRequestInput(input);
  let clientRequestHash;
  try { clientRequestHash = requestClientFingerprint(request, env); }
  catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }

  const consumeClientRateLimit = dependencies.consumeClientRateLimit || consumeRateLimit;
  const clientLimit = consumeClientRateLimit(`mobile-native-otp:${clientRequestHash}`, {
    limit: MOBILE_NATIVE_OTP_CLIENT_LIMIT,
    windowMs: MOBILE_NATIVE_OTP_CLIENT_WINDOW_MS,
  });
  if (clientLimit?.allowed !== true) {
    await waitForEnumerationFloor(startedAt, dependencies);
    return requestResponse(randomUUID());
  }

  const authorizeEligibility = dependencies.authorizeEligibility || authorizeParticipantEmailOtpEligibility;
  const eligibility = await authorizeEligibility({
    email: parsed.identifier,
    client_request_hash: clientRequestHash,
  }, dependencies.authorizeOptions).catch(() => ({ ok: false }));
  if (!eligibility?.ok) throw new MobileApiError("MOBILE_API_UNAVAILABLE");

  const decision = eligibility.authorization?.payload || {};
  const challengeId = UUID.test(clean(decision.requestId))
    ? clean(decision.requestId).toLowerCase()
    : randomUUID();
  if (decision.allowed === true) {
    if (!UUID.test(clean(decision.requestId)) || !EMAIL.test(clean(decision.email)) ||
        !UUID.test(clean(decision.authUserId)) || !clean(decision.playerId)) {
      throw new MobileApiError("MOBILE_API_UNAVAILABLE");
    }
    let delivered = false;
    let safeReason = "DELIVERY_FAILED";
    const deliveryStartedAt = (dependencies.now || (() => performance.now()))();
    try {
      const expectedAuthUserId = clean(decision.authUserId).toLowerCase();
      const expectedPlayerId = clean(decision.playerId);
      const readIdentityForRequest = dependencies.readIdentityForRequest || readParticipantIdentityContextForAuth;
      const identity = await readIdentityForRequest({ authUserId: expectedAuthUserId }, dependencies.rpcOptions);
      const context = identity?.payload?.data || {};
      const stillEligible = identity?.payload?.ok === true &&
        clean(context.authUserId).toLowerCase() === expectedAuthUserId &&
        clean(context.playerId) === expectedPlayerId &&
        Boolean(clean(context.tournament?.id)) && context.membership?.active === true;
      if (stillEligible) {
        const verificationType = resolveParticipantEmailOtpVerificationType(decision.verificationType);
        // Native development never performs controlled enrollment. The only
        // accepted provider operation is an existing-user sign-in with
        // shouldCreateUser:false inside requestParticipantEmailOtp.
        if (verificationType !== "email") throw new Error("Native enrollment is disabled.");
        const authClient = dependencies.authClient || createOtpDeliveryClient(env);
        const sendOtp = dependencies.sendOtp || requestParticipantEmailOtp;
        const { error } = await sendOtp(authClient, {
          email: clean(decision.email).toLowerCase(),
          captchaToken: parsed.captchaToken,
          verificationType,
        });
        delivered = !error;
        safeReason = delivered
          ? "DELIVERY_ACCEPTED"
          : classifyParticipantEmailOtpAuthError(error).safeReason;
      } else {
        safeReason = "IDENTITY_NOT_ELIGIBLE";
      }
    } catch {
      delivered = false;
      if (safeReason === "DELIVERY_FAILED") safeReason = "IDENTITY_OR_DELIVERY_UNAVAILABLE";
    }
    try {
      const recordDelivery = dependencies.recordDelivery || recordSingleParticipantOtpDelivery;
      await recordDelivery({
        request_id: challengeId,
        succeeded: delivered,
        safe_reason: safeReason,
        duration_ms: Math.max(0, Math.round((dependencies.now || (() => performance.now()))() - deliveryStartedAt)),
      }, dependencies.rpcOptions);
    } catch {
      // Delivery/audit failures are intentionally indistinguishable from an
      // unknown identifier. Certification still fails closed without SENT.
    }
  }

  await waitForEnumerationFloor(startedAt, dependencies);
  return requestResponse(challengeId);
}

function certifiedIdentity(payload, authUserId) {
  const context = payload?.data || {};
  return payload?.ok === true && clean(context.authUserId) === authUserId &&
    Boolean(clean(context.playerId)) && Boolean(clean(context.tournament?.id)) &&
    context.membership?.active === true;
}

async function recordFailedCertification(challengeId, authUserId, durationMs, dependencies) {
  try {
    const recordVerification = dependencies.recordVerification || recordSingleParticipantOtpVerification;
    await recordVerification({
      request_id: challengeId,
      auth_user_id: authUserId || null,
      succeeded: false,
      duration_ms: durationMs,
    }, dependencies.rpcOptions);
  } catch {
    // Invalid, expired, and already-consumed challenges intentionally share
    // one public denial, regardless of whether a failure audit can be added.
  }
}

export async function certifyMobileNativeOtp({
  request,
  input,
  env = process.env,
  dependencies = {},
} = {}) {
  requireNativeAuthEnvironment(env);
  const { challengeId } = parseCertificationInput(input);
  const token = mobileBearerTokenFromRequest(request);
  const startedAt = (dependencies.now || (() => performance.now()))();
  const verifyUser = dependencies.verifyUser || verifyMobileSupabaseAuthenticatedUser;
  let verification;
  try { verification = await verifyUser(token, { env, client: dependencies.authClient }); }
  catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  if (verification?.status === "unavailable") throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  const authUserId = clean(verification?.authUserId).toLowerCase();
  const verifiedEmail = clean(verification?.email).toLowerCase();
  if (verification?.status !== "active" || !UUID.test(authUserId) ||
      verification?.emailVerified !== true || !EMAIL.test(verifiedEmail)) {
    throw new MobileApiError("INVALID_TOKEN");
  }

  let certificationClientHash;
  try {
    const clientHash = requestClientFingerprint(request, env);
    certificationClientHash = participantAuthClientRequestHash(`${authUserId}|${clientHash}`, {
      secret: participantAuthRateLimitSecret(env),
    });
  } catch {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  const consumeCertificationRateLimit = dependencies.consumeCertificationRateLimit || consumeRateLimit;
  const certificationLimit = consumeCertificationRateLimit(
    `mobile-native-certify:${certificationClientHash}`,
    {
      limit: MOBILE_NATIVE_CERTIFICATION_CLIENT_LIMIT,
      windowMs: MOBILE_NATIVE_CERTIFICATION_CLIENT_WINDOW_MS,
    },
  );
  if (certificationLimit?.allowed !== true) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }

  const authorizeVerification = dependencies.authorizeVerification || authorizeSingleParticipantOtpVerification;
  let authorization;
  try {
    authorization = await authorizeVerification({
      request_id: challengeId,
      email_identity_hash: participantAuthEmailHash(verifiedEmail),
    }, dependencies.rpcOptions);
  } catch {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  const allowed = authorization?.payload || {};
  const durationMs = () => Math.max(0, Math.round((dependencies.now || (() => performance.now()))() - startedAt));
  if (allowed.allowed !== true || clean(allowed.authUserId).toLowerCase() !== authUserId) {
    await recordFailedCertification(challengeId, authUserId, durationMs(), dependencies);
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }

  const tournamentId = clean(allowed.tournamentId);
  const expectedPlayerId = clean(allowed.playerId);
  if (!tournamentId || !expectedPlayerId) {
    await recordFailedCertification(challengeId, authUserId, durationMs(), dependencies);
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }

  const readIdentity = dependencies.readIdentity || readParticipantIdentityContextForAuth;
  let before;
  try { before = await readIdentity({ authUserId, tournamentId }, dependencies.rpcOptions); }
  catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }
  if (!certifiedIdentity(before?.payload, authUserId) ||
      clean(before.payload.data.playerId) !== expectedPlayerId ||
      clean(before.payload.data.tournament?.id) !== tournamentId) {
    await recordFailedCertification(challengeId, authUserId, durationMs(), dependencies);
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }

  const recordVerification = dependencies.recordVerification || recordSingleParticipantOtpVerification;
  try {
    await recordOtpVerificationWithRecovery({
      request_id: challengeId,
      auth_user_id: authUserId,
      succeeded: true,
      duration_ms: durationMs(),
    }, {
      recordVerification: (value) => recordVerification(value, dependencies.rpcOptions),
      attempts: 3,
    });
  } catch {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }

  let after;
  try { after = await readIdentity({ authUserId, tournamentId }, dependencies.rpcOptions); }
  catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }
  if (!certifiedIdentity(after?.payload, authUserId) ||
      clean(after.payload.data.playerId) !== expectedPlayerId ||
      clean(after.payload.data.tournament?.id) !== tournamentId) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }

  const issueCertification = dependencies.issueCertification || issueMobileNativeCertification;
  let certification;
  try {
    certification = issueCertification({
      authUserId,
      playerId: expectedPlayerId,
      tournamentId,
      env,
    });
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  if (!clean(certification?.token) ||
      certification?.expiresInSeconds !== MOBILE_NATIVE_CERTIFICATION_SECONDS) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }

  return {
    status: 200,
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data: {
        certified: true,
        certificationToken: certification.token,
        expiresInSeconds: certification.expiresInSeconds,
      },
    },
  };
}
