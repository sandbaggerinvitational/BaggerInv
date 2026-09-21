import {sealNativePhoneChallenge,openNativePhoneChallenge} from "./native-phone-challenge-envelope.js";
import {reportCanonicalPhoneVerification as default_reportCanonicalPhoneVerification} from "./production-verify-feedback.js";
import { randomUUID } from "node:crypto";
import { cookies as default_cookies } from "next/headers.js";
import { NextResponse } from "next/server.js";

import { normalizeParticipantAuthPhone, maskParticipantAuthPhone } from "./participant-auth-phone.js";
import { participantIdentityAuthorityEnvironment as default_participantIdentityAuthorityEnvironment } from "./participant-identity-authority.js";
import {
  authorizeParticipantPhoneLoginProof as default_authorizeParticipantPhoneLoginProof,
  authorizeParticipantPhoneLoginRequest as default_authorizeParticipantPhoneLoginRequest,
  authorizeParticipantPhoneLoginVerification as default_authorizeParticipantPhoneLoginVerification,
  beginParticipantPhoneLogin as default_beginParticipantPhoneLogin,
  beginParticipantPhonePublicRequest as default_beginParticipantPhonePublicRequest,
  cancelParticipantPhoneLogin as default_cancelParticipantPhoneLogin,
  completeParticipantPhoneLogin as default_completeParticipantPhoneLogin,
  readParticipantPhoneLoginState as default_readParticipantPhoneLoginState,
  recordParticipantPhoneLoginFailure as default_recordParticipantPhoneLoginFailure,
  recordParticipantPhoneLoginSend as default_recordParticipantPhoneLoginSend,
} from "./participant-identity-supabase.js";
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
} from "./participant-phone-otp.js";
import { participantAuthExperienceConfiguration as default_participantAuthExperienceConfiguration } from "./participant-sms-auth-feature.js";
import { createParticipantAuthServerClient as default_createParticipantAuthServerClient, verifyParticipantAuthClaims as default_verifyParticipantAuthClaims } from "./supabase-auth-server.js";

import { assertProductionCutoverRequest } from "./production-cutover-activation-contract.js";
import { createParticipantPhoneCookieTransaction } from "./participant-phone-cookie-transaction.js";

import { requireMobileNativeCapability } from "./mobile-native-admission.js";
import { certifyCanonicalNativeParticipant as default_certifyParticipant } from "./mobile-native-participant-certification.js";

export function createParticipantPhoneLoginHandler({native=false,nativeAdmission={},certificationDependencies={},certifyParticipant=default_certifyParticipant,
cookies = default_cookies,
createParticipantAuthServerClient = default_createParticipantAuthServerClient,
verifyParticipantAuthClaims = default_verifyParticipantAuthClaims,
participantAuthExperienceConfiguration = default_participantAuthExperienceConfiguration,
participantIdentityAuthorityEnvironment = default_participantIdentityAuthorityEnvironment,
authorizeParticipantPhoneLoginProof = default_authorizeParticipantPhoneLoginProof,
authorizeParticipantPhoneLoginRequest = default_authorizeParticipantPhoneLoginRequest,
authorizeParticipantPhoneLoginVerification = default_authorizeParticipantPhoneLoginVerification,
beginParticipantPhoneLogin = default_beginParticipantPhoneLogin,
beginParticipantPhonePublicRequest = default_beginParticipantPhonePublicRequest,
cancelParticipantPhoneLogin = default_cancelParticipantPhoneLogin,
completeParticipantPhoneLogin = default_completeParticipantPhoneLogin,
readParticipantPhoneLoginState = default_readParticipantPhoneLoginState,
recordParticipantPhoneLoginFailure = default_recordParticipantPhoneLoginFailure,
recordParticipantPhoneLoginSend = default_recordParticipantPhoneLoginSend,
reportCanonicalPhoneVerification = default_reportCanonicalPhoneVerification
}={}) {


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

function canonicalRequestAllowed(request, requireOrigin) {
  if (!participantIdentityAuthorityEnvironment().productionCutoverIdentity) return true;
  try { assertProductionCutoverRequest(request, process.env, { requireOrigin }); return true; }
  catch { return false; }
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

function proofCookieName() {
  if (native) return "sbi-native-phone-login-proof";
  return participantIdentityAuthorityEnvironment().productionCutoverIdentity
    ? (native ? "sbi-native-phone-login-proof" : "sbi-participant-phone-login-proof") : PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE;
}

function loginProofCookie(value, age) {
  return { ...participantPhoneLoginProofCookie(native && age !== 0 ? sealNativePhoneChallenge(value,proofSecret()) : value, age), name: proofCookieName() };
}

function readProof(cookieStore) {
  return verifyParticipantPhoneLoginProof(
    native ? openNativePhoneChallenge(clean(cookieStore.get(proofCookieName())?.value),proofSecret()) : clean(cookieStore.get(proofCookieName())?.value),
    proofSecret(),
  );
}

function clearProof(response) {
  response.cookies.set(loginProofCookie("", 0));
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

async function GET(request) {
  if (!canonicalRequestAllowed(request, false)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
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

async function POST(request, parsedInput) {
  if (!canonicalRequestAllowed(request, !native)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  if (native && process.env.VERCEL_ENV !== "production") return errorResponse("PHONE_OTP_CONFIGURATION_REQUIRED",503);
  if (native) await requireMobileNativeCapability("auth", {request, env:process.env, dependencies:nativeAdmission});
  const feature = publicPhoneFeature();
  if (!feature.available) return errorResponse("PHONE_OTP_CONFIGURATION_REQUIRED", 503);
  if (!native && !sameOriginMutation(request)) return errorResponse("PHONE_OTP_CAPTCHA_FAILED", 403);
  const cookieStore = await cookies();
  const input = parsedInput ?? await request.json().catch(() => ({}));
  const keys = {request:['action','phone','captchaToken'],resend:['action','phone','captchaToken','attemptId'],verify:['action','attemptId','token'],cancel:['action','attemptId']};
  if (native && (!input || typeof input !== 'object' || Array.isArray(input) || !keys[input.action] || Object.keys(input).some(k=>!keys[input.action].includes(k)))) return errorResponse('PHONE_OTP_CONTEXT_INVALID',400);
  const action = clean(input.action).toLowerCase();
  let verificationClient = null;
  let verificationCommitted = false;

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
        const decoyResponse = NextResponse.json({
          ok: true,
          status: "VERIFICATION_PENDING",
          attemptId: randomUUID(),
          maskedMobile: maskParticipantAuthPhone(phone.e164),
          resendCooldownSeconds: 60,
          message: genericRequestMessage,
        }, { headers: responseHeaders });
        if (native) decoyResponse.cookies.set(loginProofCookie(''));
        return decoyResponse;
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
        response.cookies.set(loginProofCookie(proofToken));
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
        const decoyResponse = NextResponse.json({
          ok: true,
          status: "VERIFICATION_PENDING",
          attemptId: randomUUID(),
          maskedMobile: maskParticipantAuthPhone(phone.e164),
          resendCooldownSeconds: 60,
          message: genericRequestMessage,
        }, { headers: responseHeaders });
        if (native) decoyResponse.cookies.set(loginProofCookie(''));
        return decoyResponse;
      }
      const currentRead = await authorizeParticipantPhoneLoginProof(proofRpcInput(previousProof));
      const current = currentRead.payload || {};
      if (current.allowed !== true) return clearProof(errorResponse(current.code || "PHONE_OTP_STALE"));
      const cancelled = await cancelParticipantPhoneLogin(proofRpcInput(previousProof, { attempt_id: clean(input.attemptId) }));
      if (cancelled.payload?.ok !== true) return errorResponse("PHONE_OTP_INVALID_OR_EXPIRED");
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
      response.cookies.set(loginProofCookie(sent.proofToken));
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

    // Provider cookies remain private until canonical completion succeeds.
    const cookieTransaction = createParticipantPhoneCookieTransaction(cookieStore);
    const authClient = createParticipantAuthServerClient(cookieTransaction.store);
    verificationClient = authClient;
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
      await recordParticipantPhoneLoginFailure(proofRpcInput(proof, {
        attempt_id: attemptId,
        safe_reason: code,
        conclusive_invalid_code: verified.error?.code === "otp_expired" && [403,422].includes(Number(verified.error?.status)),
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
      console.error("Participant phone login completion gate rejected", { code: completion.code || "PHONE_LOGIN_VERIFY_FAILED", attemptId });
      return errorResponse(completion.code || "PHONE_LOGIN_VERIFY_FAILED");
    }
    if (native) {
      const session = (await authClient.auth.getSession()).data?.session;
      if (!session?.access_token || !session?.refresh_token || session.user?.id?.toLowerCase() !== proof.authUserId.toLowerCase()) throw Object.assign(Error('PHONE_LOGIN_SESSION_FAILED'),{code:'PHONE_LOGIN_SESSION_FAILED'});
      const certification = await certifyParticipant({request, authUserId:verified.userId, playerId:proof.playerId, tournamentId:proof.tournamentId, env:process.env, dependencies:{...certificationDependencies,nativeAdmission}});
      const response = clearProof(NextResponse.json({ok:true,apiVersion:'v1',data:{
        session:{accessToken:session.access_token,refreshToken:session.refresh_token,userId:verified.userId},
        certification,playerId:proof.playerId,tournamentId:proof.tournamentId
      }},{headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}}));
      await reportCanonicalPhoneVerification(attemptId,verified.userId);
      verificationCommitted = true;
      return response;
    }
    const totalMs = Math.round(performance.now() - requestStarted);
    const response = clearProof(NextResponse.json({
      ok: true,
      session: "active",
      sameAuthUser: true,
      linkedPlayerId: completion.playerId,
      participantSessionEstablished: true,
      refreshSessionAvailable: true,
      playerPassportResolved: true, // Compatibility field; authority is the canonical participant resolver.
      participantAuthorityResolved: true,
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
    await reportCanonicalPhoneVerification(attemptId,verified.userId);
    cookieTransaction.commit(response);
    verificationCommitted = true;
    return response;
  } catch (error) {
    if (error?.code === "PHONE_INVALID") return NextResponse.json({ error: "Enter a valid mobile number.", category: "INVALID_PHONE" }, { status: 400, headers: responseHeaders });
    const code = error?.code || error?.identityDiagnostics?.code || "PHONE_LOGIN_VERIFY_FAILED";
    console.error("Participant phone login failed", { code });
    return errorResponse(code, Number(error?.status) || undefined);
  } finally {
    // Includes completion exceptions after a successful provider verification.
    if (verificationClient && !verificationCommitted) {
      await verificationClient.auth.signOut({ scope: "local" }).catch(() => null);
    }
  }
}

return {GET,POST};
}
