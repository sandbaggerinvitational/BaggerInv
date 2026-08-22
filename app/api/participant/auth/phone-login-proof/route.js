import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { participantIdentityAuthorityEnvironment } from "../../../../../lib/participant-identity-authority.js";
import {
  authorizeControlledParticipantPhoneLoginSurface,
  authorizeParticipantPhoneLoginProof,
  authorizeParticipantPhoneLoginVerification,
  beginParticipantPhoneLogin,
  completeParticipantPhoneLogin,
  readParticipantIdentityContextForAuth,
  readParticipantPhoneLoginState,
  recordParticipantPhoneLoginFailure,
  recordParticipantPhoneLoginSend,
} from "../../../../../lib/participant-identity-supabase.js";
import {
  PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE,
  classifyParticipantPhoneOtpProviderFailure,
  createParticipantPhoneLoginProof,
  normalizeParticipantPhoneOtpToken,
  participantPhoneLoginProofCookie,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpErrorMessage,
  participantPhoneOtpProviderFailureCode,
  requestExistingParticipantPhoneLogin,
  verifyExistingParticipantPhoneLogin,
  verifyParticipantPhoneLoginProof,
} from "../../../../../lib/participant-phone-otp.js";
import { participantSmsProviderTestConfigured } from "../../../../../lib/participant-sms-auth-feature.js";
import { createParticipantAuthServerClient, verifyParticipantAuthClaims } from "../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const proofSecret = () => process.env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET;

function controlledFeatureAvailable() {
  const authority = participantIdentityAuthorityEnvironment();
  return process.env.VERCEL_ENV === "preview" && authority.participantAuthEnabled &&
    authority.resolved === "supabase" && participantSmsProviderTestConfigured();
}

function sameOriginMutation(request) {
  const origin = clean(request.headers.get("origin"));
  const fetchSite = clean(request.headers.get("sec-fetch-site")).toLowerCase();
  let expectedOrigin = "";
  try { expectedOrigin = new URL(request.url).origin; }
  catch { return false; }
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin");
}

function statusFor(code) {
  if (["PHONE_OTP_COOLDOWN", "PHONE_OTP_RATE_LIMITED"].includes(code)) return 429;
  if (["PHONE_OTP_PROVIDER_UNAVAILABLE", "PHONE_OTP_CONFIGURATION_REQUIRED"].includes(code)) return 503;
  if (["PHONE_LOGIN_PROOF_REQUIRED", "PHONE_OTP_SESSION_REQUIRED"].includes(code)) return 401;
  if (["PHONE_OTP_INVALID", "PHONE_OTP_INVALID_OR_EXPIRED"].includes(code)) return 400;
  return 409;
}

function errorResponse(code, status = statusFor(code)) {
  return NextResponse.json({ error: participantPhoneOtpErrorMessage(code), code }, { status, headers: responseHeaders });
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
  const token = clean(cookieStore.get(PARTICIPANT_PHONE_LOGIN_PROOF_COOKIE)?.value);
  return verifyParticipantPhoneLoginProof(token, proofSecret());
}

function clearProof(response) {
  response.cookies.set(participantPhoneLoginProofCookie("", 0));
  return response;
}

async function requireSignedOut(cookieStore) {
  const current = await verifyParticipantAuthClaims(cookieStore);
  return current.status !== "active";
}

export async function GET() {
  if (!controlledFeatureAvailable()) return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  const cookieStore = await cookies();
  let proof;
  try { proof = readProof(cookieStore); }
  catch {
    return NextResponse.json({
      ok: true,
      armed: false,
      status: "READY",
      controlledPhoneLoginAvailable: true,
      publicSmsLoginEnabled: false,
    }, { headers: responseHeaders });
  }
  const stateRead = await readParticipantPhoneLoginState(proofRpcInput(proof));
  const state = stateRead.payload || {};
  if (state.allowed !== true) return clearProof(errorResponse(state.code || "PHONE_LOGIN_PROOF_REQUIRED"));
  return NextResponse.json({
    ok: true,
    armed: true,
    status: state.status || "READY",
    proofUsed: state.proofUsed === true,
    attemptId: state.attemptId || null,
    maskedMobile: state.maskedMobile || "Approved mobile",
    resendCooldownSeconds: Number(state.resendCooldownSeconds || 0),
    expiresAt: state.expiresAt || null,
    publicSmsLoginEnabled: false,
  }, { headers: responseHeaders });
}

export async function POST(request) {
  if (!controlledFeatureAvailable()) return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  if (!sameOriginMutation(request)) return errorResponse("PHONE_LOGIN_PROOF_REQUIRED", 403);
  const cookieStore = await cookies();
  const input = await request.json().catch(() => ({}));
  const action = clean(input.action);

  try {
    if (action === "arm") {
      const verified = await verifyParticipantAuthClaims(cookieStore);
      if (verified.status !== "active" || !verified.claims?.sub) return errorResponse("PHONE_OTP_SESSION_REQUIRED");
      const contextRead = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub });
      const context = contextRead.payload?.data;
      if (!contextRead.payload?.ok || !context?.playerId || !context?.tournament?.id) return errorResponse("PHONE_OTP_NOT_ELIGIBLE");
      const authorizationRead = await authorizeParticipantPhoneLoginProof({
        tournament_id: context.tournament.id,
        player_id: context.playerId,
        auth_user_id: verified.claims.sub,
      });
      const authorization = authorizationRead.payload || {};
      if (authorization.allowed !== true) return errorResponse(authorization.code || "PHONE_OTP_NOT_ELIGIBLE");
      const proofToken = proofTokenForAuthorization(authorization);
      const authClient = createParticipantAuthServerClient(cookieStore);
      const signedOut = await authClient.auth.signOut({ scope: "local" });
      if (signedOut.error) return errorResponse("PHONE_LOGIN_PROOF_REQUIRED", 503);
      const response = NextResponse.json({
        ok: true,
        armed: true,
        session: "inactive",
        status: "READY",
        maskedMobile: authorization.maskedMobile || "Approved mobile",
        linkedPlayerId: authorization.playerId,
        directorEntitlementBefore: {
          state: authorization.directorEntitlementState,
          role: authorization.directorRole,
          scope: authorization.directorScope,
          revision: authorization.directorEntitlementRevision,
          source: authorization.directorEntitlementSource,
        },
        message: "Preview participant session cleared. The controlled phone login proof is ready; no SMS has been sent.",
      }, { headers: responseHeaders });
      response.cookies.set(participantPhoneLoginProofCookie(proofToken));
      return response;
    }

    let proof;
    let signedOutProofToken = "";
    try { proof = readProof(cookieStore); }
    catch (error) {
      if (action !== "request") return errorResponse(error?.code || "PHONE_LOGIN_PROOF_REQUIRED");
      if (!(await requireSignedOut(cookieStore))) return errorResponse("PHONE_LOGIN_PROOF_REQUIRED", 409);
      const authorizationRead = await authorizeControlledParticipantPhoneLoginSurface();
      const authorization = authorizationRead.payload || {};
      if (authorization.allowed !== true) return errorResponse(authorization.code || "PHONE_OTP_NOT_ELIGIBLE");
      signedOutProofToken = proofTokenForAuthorization(authorization);
      proof = verifyParticipantPhoneLoginProof(signedOutProofToken, proofSecret());
    }
    if (!(await requireSignedOut(cookieStore))) return errorResponse("PHONE_LOGIN_PROOF_REQUIRED", 409);

    if (action === "request") {
      const fingerprint = participantPhoneOtpClientFingerprint(request, proofSecret());
      const attemptRead = await beginParticipantPhoneLogin(proofRpcInput(proof, { client_fingerprint: fingerprint }));
      const attempt = attemptRead.payload || {};
      if (attempt.allowed !== true) return errorResponse(attempt.code || "PHONE_OTP_NOT_ELIGIBLE");
      const authClient = createParticipantAuthServerClient(cookieStore);
      const started = performance.now();
      let providerAccepted = false;
      try {
        const requested = await requestExistingParticipantPhoneLogin({ authClient, phone: attempt.phoneE164 });
        providerAccepted = requested.providerAccepted === true;
        const recorded = await recordParticipantPhoneLoginSend(proofRpcInput(proof, {
          attempt_id: attempt.attemptId,
          succeeded: true,
          provider_called: true,
          safe_reason: "PHONE_LOGIN_CODE_SENT",
          duration_ms: Math.round(performance.now() - started),
        }));
        if (recorded.payload?.ok !== true) return errorResponse(recorded.payload?.code || "PHONE_LOGIN_SEND_FAILED");
        const response = NextResponse.json({
          ok: true,
          status: "VERIFICATION_PENDING",
          attemptId: attempt.attemptId,
          maskedMobile: attempt.maskedMobile || "Approved mobile",
          resendCooldownSeconds: 60,
          expiresAt: recorded.payload.expiresAt || attempt.expiresAt,
          shouldCreateUser: false,
          message: "Sign-in code sent to the approved mobile.",
        }, { headers: responseHeaders });
        if (signedOutProofToken) response.cookies.set(participantPhoneLoginProofCookie(signedOutProofToken));
        return response;
      } catch (error) {
        const failure = classifyParticipantPhoneOtpProviderFailure(error, "send");
        const code = failure.code === "PHONE_OTP_PROVIDER_UNAVAILABLE" ? "PHONE_LOGIN_SEND_FAILED" : failure.code;
        await recordParticipantPhoneLoginSend(proofRpcInput(proof, {
          attempt_id: attempt.attemptId,
          succeeded: false,
          provider_called: providerAccepted || failure.providerCalled === true,
          safe_reason: code,
          duration_ms: Math.round(performance.now() - started),
        })).catch(() => null);
        console.warn("Controlled participant phone login send rejected", {
          code,
          authErrorCode: failure.authErrorCode,
          authStatus: failure.authStatus,
          providerErrorClass: failure.providerErrorClass,
        });
        return errorResponse(code);
      }
    }

    if (action !== "verify") return NextResponse.json({ error: "Unsupported controlled phone login operation." }, { status: 400, headers: responseHeaders });
    const token = normalizeParticipantPhoneOtpToken(input.token);
    const attemptId = clean(input.attemptId);
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return errorResponse("PHONE_OTP_INVALID", 400);
    const allowedRead = await authorizeParticipantPhoneLoginVerification(proofRpcInput(proof, { attempt_id: attemptId }));
    const allowed = allowedRead.payload || {};
    if (allowed.allowed !== true) return errorResponse(allowed.code || "PHONE_OTP_INVALID_OR_EXPIRED");

    const authClient = createParticipantAuthServerClient(cookieStore);
    const started = performance.now();
    const verified = await verifyExistingParticipantPhoneLogin({
      authClient,
      phone: allowed.phoneE164,
      token,
      expectedAuthUserId: proof.authUserId,
    });
    if (!verified.ok || !verified.sessionCreated || !verified.refreshSessionAvailable) {
      const code = verified.error
        ? participantPhoneOtpProviderFailureCode(verified.error, "verify")
        : !verified.ok ? "PHONE_OTP_AUTH_MISMATCH" : "PHONE_LOGIN_SESSION_FAILED";
      if (verified.sessionCreated) await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      await recordParticipantPhoneLoginFailure(proofRpcInput(proof, {
        attempt_id: attemptId,
        safe_reason: code,
        duration_ms: Math.round(performance.now() - started),
      })).catch(() => null);
      return errorResponse(code === "PHONE_OTP_PROVIDER_UNAVAILABLE" ? "PHONE_LOGIN_VERIFY_FAILED" : code);
    }
    const authenticUser = await authClient.auth.getUser();
    if (authenticUser.error || clean(authenticUser.data?.user?.id) !== proof.authUserId) {
      await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      await recordParticipantPhoneLoginFailure(proofRpcInput(proof, {
        attempt_id: attemptId,
        safe_reason: "PHONE_OTP_AUTH_MISMATCH",
        duration_ms: Math.round(performance.now() - started),
      })).catch(() => null);
      return errorResponse("PHONE_OTP_AUTH_MISMATCH");
    }
    const contextRead = await readParticipantIdentityContextForAuth({ authUserId: verified.userId });
    const context = contextRead.payload?.data;
    if (!contextRead.payload?.ok || context?.playerId !== proof.playerId || context?.tournament?.id !== proof.tournamentId || context?.membership?.active !== true) {
      await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      await recordParticipantPhoneLoginFailure(proofRpcInput(proof, {
        attempt_id: attemptId,
        safe_reason: "PHONE_LOGIN_PASSPORT_MISSING",
        duration_ms: Math.round(performance.now() - started),
      })).catch(() => null);
      return errorResponse("PHONE_LOGIN_PASSPORT_MISSING");
    }
    const completionRead = await completeParticipantPhoneLogin(proofRpcInput(proof, {
      attempt_id: attemptId,
      returned_auth_user_id: verified.userId,
      session_created: verified.sessionCreated,
      refresh_session_available: verified.refreshSessionAvailable,
      duration_ms: Math.round(performance.now() - started),
    }));
    const completion = completionRead.payload || {};
    if (completion.ok !== true) {
      await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      return errorResponse(completion.code || "PHONE_LOGIN_VERIFY_FAILED");
    }
    return clearProof(NextResponse.json({
      ok: true,
      status: "VERIFIED",
      session: "active",
      sameAuthUser: completion.sameAuthUser === true,
      linkedPlayerId: context.playerId,
      participantSessionEstablished: completion.sessionEstablished === true,
      refreshSessionAvailable: completion.refreshSessionAvailable === true,
      playerPassportResolved: true,
      scoringAuthorizationUnchanged: completion.scoringAuthorizationUnchanged === true,
      phoneIdentifierUnchanged: completion.phoneIdentifierUnchanged === true,
      directorEntitlementPreserved: completion.directorEntitlementPreserved === true,
      directorEntitlementBefore: completion.directorEntitlementBefore,
      directorEntitlementAfter: completion.directorEntitlementAfter,
      newDirectorEntitlements: Number(completion.newDirectorEntitlements || 0),
      directorPrivilegeEscalation: completion.directorPrivilegeEscalation === true,
      authMethodChangesDirectorAuthorization: completion.authMethodChangesDirectorAuthorization === true,
      message: "Phone sign-in verified on the existing Auth user. Player Passport CB01 is active.",
    }, { headers: responseHeaders }));
  } catch (error) {
    const code = error?.code || error?.identityDiagnostics?.code || "PHONE_LOGIN_VERIFY_FAILED";
    console.error("Controlled participant phone login failed", { code, message: "Controlled participant phone login failed." });
    return errorResponse(code, Number(error?.status) || statusFor(code));
  }
}
