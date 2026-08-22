import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { normalizeParticipantAuthPhone, maskParticipantAuthPhone } from "../../../../../lib/participant-auth-phone.js";
import { participantIdentityAuthorityEnvironment } from "../../../../../lib/participant-identity-authority.js";
import {
  authorizeParticipantPhoneLoginProof,
  authorizeParticipantPhoneLoginRequest,
  authorizeParticipantPhoneLoginVerification,
  beginParticipantPhoneLogin,
  beginParticipantPhonePublicRequest,
  cancelParticipantPhoneLogin,
  completeParticipantPhoneLogin,
  readParticipantPhoneLoginState,
  recordParticipantPhoneLoginFailure,
  recordParticipantPhoneLoginSend,
} from "../../../../../lib/participant-identity-supabase.js";
import {
  PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE,
  classifyParticipantPhoneOtpProviderFailure,
  createParticipantPhoneLoginProof,
  normalizeParticipantAuthCaptchaToken,
  normalizeParticipantPhoneOtpToken,
  participantPhoneLoginProofCookie,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpIdentifierFingerprint,
  requestExistingParticipantPhoneLogin,
  verifyExistingParticipantPhoneLogin,
  verifyParticipantPhoneLoginProof,
} from "../../../../../lib/participant-phone-otp.js";
import { participantAuthExperienceConfiguration } from "../../../../../lib/participant-sms-auth-feature.js";
import { createParticipantAuthServerClient, verifyParticipantAuthClaims } from "../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const proofSecret = () => process.env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET;
const genericRequestMessage = "If that mobile number is approved for The Bagger, a code will arrive shortly. You can also use email.";

function publicPhoneFeature() {
  const authority = participantIdentityAuthorityEnvironment();
  const experience = participantAuthExperienceConfiguration();
  return {
    ...experience,
    available: experience.smsEnabled && authority.participantAuthEnabled && authority.resolved === "supabase",
  };
}

function sameOriginMutation(request) {
  const origin = clean(request.headers.get("origin"));
  const fetchSite = clean(request.headers.get("sec-fetch-site")).toLowerCase();
  let expectedOrigin = "";
  try { expectedOrigin = new URL(request.url).origin; }
  catch { return false; }
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin");
}

function proofRpcInput(proof, additions = {}) {
  return {
    tournament_id: proof.tournamentId,
    player_id: proof.playerId,
    auth_user_id: proof.authUserId,
    identifier_id: proof.identifierId,
    identifier_revision: proof.identifierRevision,
    director_entitlement_state: proof.directorEntitlementState,
    director_role: proof.directorRole,
    director_scope: proof.directorScope,
    director_entitlement_revision: proof.directorEntitlementRevision,
    director_entitlement_source: proof.directorEntitlementSource,
    director_entitlement_count: proof.directorEntitlementCount,
    director_entitlement_fingerprint: proof.directorEntitlementFingerprint,
    proof_issued_at: new Date(proof.issuedAt * 1000).toISOString(),
    ...additions,
  };
}

function proofTokenForAuthorization(authorization) {
  return createParticipantPhoneLoginProof({
    authUserId: authorization.authUserId,
    playerId: authorization.playerId,
    tournamentId: authorization.tournamentId,
    identifierId: authorization.identifierId,
    identifierRevision: authorization.identifierRevision,
    directorEntitlementState: authorization.directorEntitlementState,
    directorRole: authorization.directorRole,
    directorScope: authorization.directorScope,
    directorEntitlementRevision: authorization.directorEntitlementRevision,
    directorEntitlementSource: authorization.directorEntitlementSource,
    directorEntitlementCount: authorization.directorEntitlementCount,
    directorEntitlementFingerprint: authorization.directorEntitlementFingerprint,
  }, proofSecret());
}

function readProof(cookieStore) {
  return verifyParticipantPhoneLoginProof(
    clean(cookieStore.get(PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE)?.value),
    proofSecret(),
  );
}

function clearProof(response) {
  response.cookies.set(participantPhoneLoginProofCookie("", 0));
  return response;
}

function safeError(code) {
  if (code === "PHONE_OTP_CAPTCHA_FAILED") return { message: "We couldn't verify this request. Try again.", category: "REQUEST_CHECK_FAILED", status: 400 };
  if (["PHONE_OTP_COOLDOWN", "PHONE_OTP_RATE_LIMITED"].includes(code)) return { message: "Too many attempts. Wait a few minutes or use email instead.", category: "RATE_LIMITED", status: 429 };
  if (["PHONE_OTP_INVALID", "PHONE_OTP_INVALID_OR_EXPIRED", "PHONE_OTP_REPLAY"].includes(code)) return { message: "That code is invalid or expired. Try again or request a new code.", category: "INVALID_OR_EXPIRED", status: 400 };
  if (["PHONE_OTP_AUTH_MISMATCH", "PHONE_LOGIN_DIRECTOR_PARITY_MISMATCH"].includes(code)) return { message: "We couldn't sign you in. Please use email or contact the Tournament Director.", category: "SIGN_IN_SAFETY_CHECK_FAILED", status: 409 };
  if (["PHONE_LOGIN_PASSPORT_MISSING", "PHONE_LOGIN_SESSION_FAILED"].includes(code)) return { message: "We couldn't connect this sign-in to your tournament profile. Please use email or contact the Tournament Director.", category: "PROFILE_UNAVAILABLE", status: 409 };
  if (["PHONE_LOGIN_SEND_FAILED", "PHONE_OTP_PROVIDER_UNAVAILABLE", "PHONE_OTP_CONFIGURATION_REQUIRED", "PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED"].includes(code)) return { message: "Text sign-in is temporarily unavailable. Use email instead.", category: "TEXT_UNAVAILABLE", status: 503 };
  return { message: "We couldn't sign you in. Please use email or try again.", category: "SIGN_IN_FAILED", status: 409 };
}

function errorResponse(code, status) {
  const safe = safeError(code);
  return NextResponse.json({ error: safe.message, category: safe.category }, {
    status: status || safe.status,
    headers: responseHeaders,
  });
}

async function requireSignedOut(cookieStore) {
  return (await verifyParticipantAuthClaims(cookieStore)).status !== "active";
}

async function responseFloor(started, floorMs = 450) {
  const remaining = Math.max(0, floorMs - Math.round(performance.now() - started));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function publicRateLimit(request, phoneE164) {
  const secret = proofSecret();
  return beginParticipantPhonePublicRequest({
    client_fingerprint: participantPhoneOtpClientFingerprint(request, secret),
    identifier_fingerprint: participantPhoneOtpIdentifierFingerprint(phoneE164, secret),
  });
}

async function sendLoginCode({ request, cookieStore, authorization, captchaToken }) {
  const proofToken = proofTokenForAuthorization(authorization);
  const proof = verifyParticipantPhoneLoginProof(proofToken, proofSecret());
  const rate = await publicRateLimit(request, authorization.phoneE164);
  if (rate.payload?.allowed !== true) return { error: rate.payload?.code || "PHONE_OTP_RATE_LIMITED" };
  const fingerprint = participantPhoneOtpClientFingerprint(request, proofSecret());
  const attemptRead = await beginParticipantPhoneLogin(proofRpcInput(proof, { client_fingerprint: fingerprint }));
  const attempt = attemptRead.payload || {};
  if (attempt.allowed !== true) return { error: attempt.code || "PHONE_OTP_NOT_ELIGIBLE" };

  const authClient = createParticipantAuthServerClient(cookieStore);
  const started = performance.now();
  try {
    await requestExistingParticipantPhoneLogin({ authClient, phone: attempt.phoneE164, captchaToken });
    const recorded = await recordParticipantPhoneLoginSend(proofRpcInput(proof, {
      attempt_id: attempt.attemptId,
      succeeded: true,
      provider_called: true,
      safe_reason: "PHONE_LOGIN_CODE_SENT",
      duration_ms: Math.round(performance.now() - started),
    }));
    if (recorded.payload?.ok !== true) return { error: recorded.payload?.code || "PHONE_LOGIN_SEND_FAILED" };
    return {
      proofToken,
      attemptId: attempt.attemptId,
      maskedMobile: attempt.maskedMobile || "Approved mobile",
      expiresAt: recorded.payload.expiresAt || attempt.expiresAt,
    };
  } catch (error) {
    const failure = classifyParticipantPhoneOtpProviderFailure(error, "send");
    await recordParticipantPhoneLoginSend(proofRpcInput(proof, {
      attempt_id: attempt.attemptId,
      succeeded: false,
      provider_called: failure.providerCalled === true,
      safe_reason: failure.code,
      duration_ms: Math.round(performance.now() - started),
    })).catch(() => null);
    console.warn("Participant phone login send rejected", {
      code: failure.code,
      authErrorCode: failure.authErrorCode,
      authStatus: failure.authStatus,
      providerErrorClass: failure.providerErrorClass,
    });
    return { error: failure.code };
  }
}

export async function GET() {
  const feature = publicPhoneFeature();
  if (!feature.available) return NextResponse.json({ smsEnabled: false }, { status: 404, headers: responseHeaders });
  const cookieStore = await cookies();
  let proof;
  try { proof = readProof(cookieStore); }
  catch {
    return NextResponse.json({ ok: true, smsEnabled: true, status: "READY" }, { headers: responseHeaders });
  }
  const stateRead = await readParticipantPhoneLoginState(proofRpcInput(proof));
  const state = stateRead.payload || {};
  if (state.allowed !== true) return clearProof(NextResponse.json({ ok: true, smsEnabled: true, status: "READY" }, { headers: responseHeaders }));
  return NextResponse.json({
    ok: true,
    smsEnabled: true,
    status: state.status === "VERIFICATION_PENDING" ? "VERIFICATION_PENDING" : "READY",
    attemptId: state.status === "VERIFICATION_PENDING" ? state.attemptId : null,
    maskedMobile: state.status === "VERIFICATION_PENDING" ? state.maskedMobile : null,
    resendCooldownSeconds: state.status === "VERIFICATION_PENDING" ? Number(state.resendCooldownSeconds || 0) : 0,
  }, { headers: responseHeaders });
}

export async function POST(request) {
  const feature = publicPhoneFeature();
  if (!feature.available) return errorResponse("PHONE_OTP_CONFIGURATION_REQUIRED", 503);
  if (!sameOriginMutation(request)) return errorResponse("PHONE_OTP_CAPTCHA_FAILED", 403);
  const cookieStore = await cookies();
  const input = await request.json().catch(() => ({}));
  const action = clean(input.action).toLowerCase();

  try {
    if (action === "cancel") {
      try {
        const proof = readProof(cookieStore);
        await cancelParticipantPhoneLogin(proofRpcInput(proof, { attempt_id: clean(input.attemptId) })).catch(() => null);
      } catch { /* A decoy or expired attempt has no canonical state to cancel. */ }
      return clearProof(NextResponse.json({ ok: true }, { headers: responseHeaders }));
    }

    if (!(await requireSignedOut(cookieStore))) return errorResponse("PHONE_LOGIN_SESSION_FAILED", 409);

    if (action === "request") {
      const requestStarted = performance.now();
      const phone = normalizeParticipantAuthPhone(input.phone);
      const captchaToken = normalizeParticipantAuthCaptchaToken(input.captchaToken, { required: feature.captchaRequired });
      const rate = await publicRateLimit(request, phone.e164);
      if (rate.payload?.allowed !== true) return errorResponse(rate.payload?.code || "PHONE_OTP_RATE_LIMITED");
      const authorizationRead = await authorizeParticipantPhoneLoginRequest({
        phone_e164: phone.e164,
        rollout_mode: feature.rollout,
      });
      const authorization = authorizationRead.payload || {};
      if (authorization.allowed !== true) {
        await responseFloor(requestStarted);
        return NextResponse.json({
          ok: true,
          status: "VERIFICATION_PENDING",
          attemptId: randomUUID(),
          maskedMobile: maskParticipantAuthPhone(phone.e164),
          resendCooldownSeconds: 60,
          message: genericRequestMessage,
        }, { headers: responseHeaders });
      }
      // The shared send helper owns provider and identifier limits. The public
      // rate event above is intentionally not repeated for this first request.
      const proofToken = proofTokenForAuthorization(authorization);
      const proof = verifyParticipantPhoneLoginProof(proofToken, proofSecret());
      const attemptRead = await beginParticipantPhoneLogin(proofRpcInput(proof, {
        client_fingerprint: participantPhoneOtpClientFingerprint(request, proofSecret()),
      }));
      const attempt = attemptRead.payload || {};
      if (attempt.allowed !== true) return errorResponse(attempt.code || "PHONE_OTP_RATE_LIMITED");
      const authClient = createParticipantAuthServerClient(cookieStore);
      const sendStarted = performance.now();
      try {
        await requestExistingParticipantPhoneLogin({ authClient, phone: attempt.phoneE164, captchaToken });
        const recorded = await recordParticipantPhoneLoginSend(proofRpcInput(proof, {
          attempt_id: attempt.attemptId,
          succeeded: true,
          provider_called: true,
          safe_reason: "PHONE_LOGIN_CODE_SENT",
          duration_ms: Math.round(performance.now() - sendStarted),
        }));
        if (recorded.payload?.ok !== true) return errorResponse(recorded.payload?.code || "PHONE_LOGIN_SEND_FAILED");
        await responseFloor(requestStarted);
        const response = NextResponse.json({
          ok: true,
          status: "VERIFICATION_PENDING",
          attemptId: attempt.attemptId,
          maskedMobile: attempt.maskedMobile || maskParticipantAuthPhone(phone.e164),
          resendCooldownSeconds: 60,
          message: genericRequestMessage,
        }, { headers: responseHeaders });
        response.cookies.set(participantPhoneLoginProofCookie(proofToken));
        return response;
      } catch (error) {
        const failure = classifyParticipantPhoneOtpProviderFailure(error, "send");
        await recordParticipantPhoneLoginSend(proofRpcInput(proof, {
          attempt_id: attempt.attemptId,
          succeeded: false,
          provider_called: failure.providerCalled === true,
          safe_reason: failure.code,
          duration_ms: Math.round(performance.now() - sendStarted),
        })).catch(() => null);
        console.warn("Participant phone login send rejected", {
          code: failure.code,
          authErrorCode: failure.authErrorCode,
          authStatus: failure.authStatus,
          providerErrorClass: failure.providerErrorClass,
        });
        return errorResponse(failure.code);
      }
    }

    if (action === "resend") {
      const requestStarted = performance.now();
      const captchaToken = normalizeParticipantAuthCaptchaToken(input.captchaToken, { required: feature.captchaRequired });
      let previousProof;
      try { previousProof = readProof(cookieStore); }
      catch {
        // Preserve the same externally visible cooldown/resend flow for a
        // decoy ineligible request without retaining or sending to its phone.
        const phone = normalizeParticipantAuthPhone(input.phone);
        const rate = await publicRateLimit(request, phone.e164);
        if (rate.payload?.allowed !== true) return errorResponse(rate.payload?.code || "PHONE_OTP_RATE_LIMITED");
        await responseFloor(requestStarted);
        return NextResponse.json({
          ok: true,
          status: "VERIFICATION_PENDING",
          attemptId: randomUUID(),
          maskedMobile: maskParticipantAuthPhone(phone.e164),
          resendCooldownSeconds: 60,
          message: genericRequestMessage,
        }, { headers: responseHeaders });
      }
      const currentRead = await authorizeParticipantPhoneLoginProof(proofRpcInput(previousProof));
      const current = currentRead.payload || {};
      if (current.allowed !== true) return clearProof(errorResponse(current.code || "PHONE_OTP_STALE"));
      await cancelParticipantPhoneLogin(proofRpcInput(previousProof, { attempt_id: clean(input.attemptId) })).catch(() => null);
      const sent = await sendLoginCode({
        request,
        cookieStore,
        authorization: current,
        captchaToken,
      });
      if (sent.error) return errorResponse(sent.error);
      const response = NextResponse.json({
        ok: true,
        status: "VERIFICATION_PENDING",
        attemptId: sent.attemptId,
        maskedMobile: sent.maskedMobile,
        resendCooldownSeconds: 60,
        message: "A new code is on its way.",
      }, { headers: responseHeaders });
      response.cookies.set(participantPhoneLoginProofCookie(sent.proofToken));
      return response;
    }

    if (action !== "verify") return errorResponse("PHONE_OTP_CONTEXT_INVALID", 400);
    let proof;
    try { proof = readProof(cookieStore); }
    catch { return errorResponse("PHONE_OTP_INVALID_OR_EXPIRED", 400); }
    const token = normalizeParticipantPhoneOtpToken(input.token);
    const attemptId = clean(input.attemptId);
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return errorResponse("PHONE_OTP_INVALID", 400);
    const requestStarted = performance.now();
    const preflightStarted = performance.now();
    const allowedRead = await authorizeParticipantPhoneLoginVerification(proofRpcInput(proof, { attempt_id: attemptId }));
    const preflightMs = Math.round(performance.now() - preflightStarted);
    const allowed = allowedRead.payload || {};
    if (allowed.allowed !== true) return errorResponse(allowed.code || "PHONE_OTP_INVALID_OR_EXPIRED");

    const authClient = createParticipantAuthServerClient(cookieStore);
    const verifyStarted = performance.now();
    const verified = await verifyExistingParticipantPhoneLogin({
      authClient,
      phone: allowed.phoneE164,
      token,
      expectedAuthUserId: proof.authUserId,
    });
    const verifyOtpMs = Math.round(performance.now() - verifyStarted);
    if (!verified.ok || !verified.sessionCreated || !verified.refreshSessionAvailable) {
      const code = verified.error
        ? classifyParticipantPhoneOtpProviderFailure(verified.error, "verify").code
        : !verified.ok ? "PHONE_OTP_AUTH_MISMATCH" : "PHONE_LOGIN_SESSION_FAILED";
      if (verified.sessionCreated) await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      await recordParticipantPhoneLoginFailure(proofRpcInput(proof, {
        attempt_id: attemptId,
        safe_reason: code,
        duration_ms: verifyOtpMs,
      })).catch(() => null);
      if (code === "PHONE_OTP_AUTH_MISMATCH") console.error("Participant phone login Auth UUID mismatch", { code, attemptId });
      return errorResponse(code);
    }

    const completionStarted = performance.now();
    const completionRead = await completeParticipantPhoneLogin(proofRpcInput(proof, {
      attempt_id: attemptId,
      returned_auth_user_id: verified.userId,
      session_created: verified.sessionCreated,
      refresh_session_available: verified.refreshSessionAvailable,
      duration_ms: verifyOtpMs,
    }));
    const completionMs = Math.round(performance.now() - completionStarted);
    const completion = completionRead.payload || {};
    if (completion.ok !== true || completion.sameAuthUser !== true || completion.sessionEstablished !== true ||
        completion.refreshSessionAvailable !== true || completion.playerId !== proof.playerId ||
        completion.tournamentId !== proof.tournamentId || completion.directorEntitlementPreserved !== true ||
        Number(completion.newDirectorEntitlements || 0) !== 0 || completion.directorPrivilegeEscalation === true ||
        completion.authMethodChangesDirectorAuthorization === true || completion.scoringAuthorizationUnchanged !== true ||
        completion.phoneIdentifierUnchanged !== true) {
      await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      console.error("Participant phone login completion gate rejected", { code: completion.code || "PHONE_LOGIN_VERIFY_FAILED", attemptId });
      return errorResponse(completion.code || "PHONE_LOGIN_VERIFY_FAILED");
    }
    const totalMs = Math.round(performance.now() - requestStarted);
    return clearProof(NextResponse.json({
      ok: true,
      session: "active",
      sameAuthUser: true,
      linkedPlayerId: completion.playerId,
      participantSessionEstablished: true,
      refreshSessionAvailable: true,
      playerPassportResolved: true,
      scoringAuthorizationUnchanged: true,
      phoneIdentifierUnchanged: true,
      directorEntitlementPreserved: true,
      newDirectorEntitlements: 0,
      directorPrivilegeEscalation: false,
      authMethodChangesDirectorAuthorization: false,
      timings: { preflightMs, verifyOtpMs, completionMs, totalMs },
    }, {
      headers: {
        ...responseHeaders,
        "Server-Timing": `preflight;dur=${preflightMs}, verifyOtp;dur=${verifyOtpMs}, completion;dur=${completionMs}, total;dur=${totalMs}`,
      },
    }));
  } catch (error) {
    if (error?.code === "PHONE_INVALID") return NextResponse.json({ error: "Enter a valid mobile number.", category: "INVALID_PHONE" }, { status: 400, headers: responseHeaders });
    const code = error?.code || error?.identityDiagnostics?.code || "PHONE_LOGIN_VERIFY_FAILED";
    console.error("Participant phone login failed", { code });
    return errorResponse(code, Number(error?.status) || undefined);
  }
}
