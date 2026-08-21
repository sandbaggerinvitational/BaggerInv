import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../lib/participant-identity-authority.js";
import {
  authorizeParticipantPhoneEnrollmentVerification,
  beginParticipantPhoneEnrollment,
  completeParticipantPhoneEnrollment,
  readParticipantIdentityContextForAuth,
  readParticipantPhoneEnrollmentState,
  recordParticipantPhoneEnrollmentFailure,
  recordParticipantPhoneEnrollmentSend,
} from "../../../../../lib/participant-identity-supabase.js";
import {
  assertParticipantPhoneEnrollmentAuthUser,
  classifyParticipantPhoneOtpProviderFailure,
  maskParticipantAuthPhone,
  normalizeParticipantPhoneEnrollmentStageB,
  normalizeParticipantPhoneOtpToken,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpErrorMessage,
  participantPhoneOtpProviderFailureCode,
  requestExistingParticipantPhoneEnrollment,
  verifyExistingParticipantPhoneEnrollment,
} from "../../../../../lib/participant-phone-otp.js";
import { participantSmsProviderTestConfigured } from "../../../../../lib/participant-sms-auth-feature.js";
import { createParticipantAuthAdminClient } from "../../../../../lib/supabase-auth-admin.js";
import { createParticipantAuthServerClient, verifyParticipantAuthClaims } from "../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const headers = { "Cache-Control": "private, no-store" };

function sameOriginMutation(request) {
  const origin = clean(request.headers.get("origin"));
  const fetchSite = clean(request.headers.get("sec-fetch-site")).toLowerCase();
  let expectedOrigin = "";
  try { expectedOrigin = new URL(request.url).origin; }
  catch { return false; }
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin");
}

function errorResponse(code, status) {
  return NextResponse.json({ error: participantPhoneOtpErrorMessage(code), code }, { status, headers });
}

async function authorizeParticipant(request, { mutation = true } = {}) {
  const authority = participantIdentityAuthorityEnvironment();
  if (process.env.VERCEL_ENV !== "preview" || !authority.participantAuthEnabled ||
      authority.resolved !== "supabase" || !participantSmsProviderTestConfigured()) {
    return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers }) };
  }
  if (mutation && !sameOriginMutation(request)) return { response: errorResponse("PHONE_OTP_SESSION_REQUIRED", 403) };
  const cookieStore = await cookies();
  const verified = await verifyParticipantAuthClaims(cookieStore);
  if (verified.status !== "active" || !verified.claims?.sub) {
    return { response: errorResponse("PHONE_OTP_SESSION_REQUIRED", 401) };
  }
  const contextRead = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub });
  const context = contextRead.payload?.data;
  if (!contextRead.payload?.ok || !context?.playerId || !context?.tournament?.id) {
    return { response: errorResponse("PHONE_OTP_NOT_ELIGIBLE", 403) };
  }
  return { authUserId: verified.claims.sub, context, cookieStore };
}

export async function GET(request) {
  const authorization = await authorizeParticipant(request, { mutation: false });
  if (authorization.response) return authorization.response;
  const stateRead = await readParticipantPhoneEnrollmentState({
    tournament_id: authorization.context.tournament.id,
    player_id: authorization.context.playerId,
    actor_auth_user_id: authorization.authUserId,
  });
  const state = stateRead.payload || {};
  if (state.ok !== true) return errorResponse(state.code || "PHONE_OTP_ENROLLMENT_START_FAILED", 409);
  return NextResponse.json(state, { headers });
}

async function readExpectedAuthUser(adminClient, expected) {
  const lookup = await adminClient.auth.admin.getUserById(expected.authUserId);
  if (lookup.error) throw lookup.error;
  return lookup.data?.user;
}

export async function POST(request) {
  const authorization = await authorizeParticipant(request);
  if (authorization.response) return authorization.response;
  const input = await request.json().catch(() => ({}));
  const action = clean(input.action);
  const expected = {
    authUserId: clean(authorization.authUserId),
    playerId: clean(authorization.context.playerId),
    tournamentId: clean(authorization.context.tournament.id),
  };

  try {
    if (action === "start") {
      const fingerprint = participantPhoneOtpClientFingerprint(
        request,
        process.env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET,
      );
      const attemptRead = await beginParticipantPhoneEnrollment({
        tournament_id: expected.tournamentId,
        player_id: expected.playerId,
        actor_auth_user_id: expected.authUserId,
        client_fingerprint: fingerprint,
      });
      const attempt = attemptRead.payload || {};
      if (attempt.allowed !== true) {
        const attemptCode = attempt.code || "PHONE_OTP_NOT_ELIGIBLE";
        const code = attemptCode === "PHONE_OTP_AUTH_MISMATCH" ? "PHONE_OTP_ENROLLMENT_START_FAILED" : attemptCode;
        const status = ["PHONE_OTP_COOLDOWN", "PHONE_OTP_RATE_LIMITED"].includes(code) ? 429 : 409;
        return errorResponse(code, status);
      }
      if (attempt.authUserId !== expected.authUserId || attempt.playerId !== expected.playerId ||
          attempt.tournamentId !== expected.tournamentId) {
        await recordParticipantPhoneEnrollmentSend({
          attempt_id: attempt.attemptId,
          actor_auth_user_id: expected.authUserId,
          succeeded: false,
          provider_called: false,
          safe_reason: "PHONE_OTP_AUTH_MISMATCH",
          duration_ms: 0,
        });
        return errorResponse("PHONE_OTP_ENROLLMENT_START_FAILED", 409);
      }

      const adminClient = createParticipantAuthAdminClient();
      const beforeUser = await readExpectedAuthUser(adminClient, expected);
      assertParticipantPhoneEnrollmentAuthUser(beforeUser, {
        expectedAuthUserId: expected.authUserId,
        expectedEmail: attempt.emailNormalized,
        targetPhone: attempt.phoneE164,
        phase: "before",
      });

      const authClient = createParticipantAuthServerClient(authorization.cookieStore);
      const started = performance.now();
      let providerAccepted = false;
      try {
        const requested = await requestExistingParticipantPhoneEnrollment({
          authClient,
          expectedAuthUserId: expected.authUserId,
          targetPhone: attempt.phoneE164,
          resend: attempt.authPhoneChangeState === "EXPECTED",
        });
        providerAccepted = requested.providerAccepted === true;
        const pendingUser = await readExpectedAuthUser(adminClient, expected);
        const stageB = normalizeParticipantPhoneEnrollmentStageB({
          updateUser: requested.user,
          persistedUser: pendingUser,
          expectedAuthUserId: expected.authUserId,
          expectedEmail: attempt.emailNormalized,
          targetPhone: attempt.phoneE164,
          requireUpdateUser: requested.method === "AUTHENTICATED_UPDATE_USER_PHONE",
        });
        const recorded = await recordParticipantPhoneEnrollmentSend({
          attempt_id: attempt.attemptId,
          actor_auth_user_id: expected.authUserId,
          succeeded: true,
          provider_called: true,
          safe_reason: "PHONE_CHANGE_PROVIDER_ACCEPTED",
          returned_auth_user_id: requested.userId,
          pending_phone_matches: stageB.pendingPhoneMatches,
          pending_phone_source: stageB.pendingPhoneSource,
          duration_ms: Math.round(performance.now() - started),
        });
        if (recorded.payload?.ok !== true) {
          const code = recorded.payload?.code || "PHONE_OTP_ENROLLMENT_START_FAILED";
          return errorResponse(code === "PHONE_OTP_AUTH_MISMATCH" ? "PHONE_OTP_ENROLLMENT_START_FAILED" : code, 409);
        }
        return NextResponse.json({
          ok: true,
          action,
          attemptId: attempt.attemptId,
          status: "VERIFICATION_PENDING",
          sameAuthUser: requested.sameAuthUser === true,
          phoneRepresentationNormalized: stageB.phoneRepresentationNormalized,
          enrollmentMethod: "AUTHENTICATED_PHONE_CHANGE",
          maskedMobile: maskParticipantAuthPhone(attempt.phoneE164),
          message: "Verification code sent.",
          resendCooldownSeconds: 60,
          expiresAt: recorded.payload.expiresAt || attempt.expiresAt,
        }, { headers });
      } catch (error) {
        const localSafetyError = ["PHONE_OTP_AUTH_MISMATCH", "PHONE_OTP_REPAIR_REQUIRED",
          "PHONE_OTP_PENDING_STATE_MISMATCH", "PHONE_OTP_ENROLLMENT_START_FAILED"].includes(error?.code);
        const failure = classifyParticipantPhoneOtpProviderFailure(error, "send");
        const code = localSafetyError
          ? error.code
          : failure.code;
        const responseCode = code === "PHONE_OTP_AUTH_MISMATCH"
          ? "PHONE_OTP_ENROLLMENT_START_FAILED"
          : code;
        const providerCalled = providerAccepted || (!localSafetyError && failure.providerCalled === true);
        await recordParticipantPhoneEnrollmentSend({
          attempt_id: attempt.attemptId,
          actor_auth_user_id: expected.authUserId,
          succeeded: false,
          provider_called: providerCalled,
          safe_reason: code,
          duration_ms: Math.round(performance.now() - started),
        }).catch(() => null);
        if (!localSafetyError) {
          console.warn("Participant phone enrollment provider rejected", {
            code,
            authErrorCode: failure.authErrorCode,
            authStatus: failure.authStatus,
            providerErrorClass: failure.providerErrorClass,
            providerCalled,
          });
        }
        return errorResponse(responseCode, responseCode === "PHONE_OTP_RATE_LIMITED" ? 429
          : ["PHONE_OTP_PROVIDER_UNAVAILABLE", "PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED"].includes(responseCode) ? 503 : 409);
      }
    }

    if (action !== "verify") return NextResponse.json({ error: "Unsupported phone enrollment operation." }, { status: 400, headers });
    const token = normalizeParticipantPhoneOtpToken(input.token);
    const attemptId = clean(input.attemptId);
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return errorResponse("PHONE_OTP_INVALID", 400);
    const allowedRead = await authorizeParticipantPhoneEnrollmentVerification({
      attempt_id: attemptId,
      actor_auth_user_id: expected.authUserId,
    });
    const allowed = allowedRead.payload || {};
    if (allowed.allowed !== true) {
      const allowedCode = allowed.code || "PHONE_OTP_INVALID_OR_EXPIRED";
      const code = allowedCode === "PHONE_OTP_AUTH_MISMATCH" ? "PHONE_OTP_PENDING_STATE_MISMATCH" : allowedCode;
      return errorResponse(code, code === "PHONE_OTP_REPLAY" ? 409 : 400);
    }
    if (allowed.authUserId !== expected.authUserId || allowed.playerId !== expected.playerId ||
        allowed.tournamentId !== expected.tournamentId) {
      await recordParticipantPhoneEnrollmentFailure({
        attempt_id: attemptId,
        actor_auth_user_id: expected.authUserId,
        safe_reason: "PHONE_OTP_AUTH_MISMATCH",
        duration_ms: 0,
      });
      return errorResponse("PHONE_OTP_AUTH_MISMATCH", 409);
    }

    const authClient = createParticipantAuthServerClient(authorization.cookieStore);
    const started = performance.now();
    const verified = await verifyExistingParticipantPhoneEnrollment({
      authClient,
      phone: allowed.phoneE164,
      token,
      expectedAuthUserId: expected.authUserId,
    });
    if (!verified.ok) {
      const code = verified.error
        ? participantPhoneOtpProviderFailureCode(verified.error, "verify")
        : "PHONE_OTP_AUTH_MISMATCH";
      await recordParticipantPhoneEnrollmentFailure({
        attempt_id: attemptId,
        actor_auth_user_id: expected.authUserId,
        safe_reason: code,
        duration_ms: Math.round(performance.now() - started),
      });
      if (verified.sessionCreated && code === "PHONE_OTP_AUTH_MISMATCH") {
        await authClient.auth.signOut({ scope: "local" }).catch(() => null);
      }
      return errorResponse(code, code === "PHONE_OTP_AUTH_MISMATCH" ? 409 : code === "PHONE_OTP_PROVIDER_UNAVAILABLE" ? 503 : 400);
    }

    const adminClient = createParticipantAuthAdminClient();
    const verifiedUser = await readExpectedAuthUser(adminClient, expected);
    assertParticipantPhoneEnrollmentAuthUser(verifiedUser, {
      expectedAuthUserId: expected.authUserId,
      expectedEmail: allowed.emailNormalized,
      targetPhone: allowed.phoneE164,
      phase: "verified",
    });
    const completion = await completeParticipantPhoneEnrollment({
      attempt_id: attemptId,
      actor_auth_user_id: expected.authUserId,
      returned_auth_user_id: verified.userId,
      duration_ms: Math.round(performance.now() - started),
    });
    if (completion.payload?.ok !== true) {
      const completionCode = completion.payload?.code || "PHONE_OTP_VERIFY_FAILED";
      return errorResponse(completionCode === "PHONE_OTP_AUTH_MISMATCH" ? "PHONE_OTP_VERIFY_FAILED" : completionCode, 409);
    }
    return NextResponse.json({
      ok: true,
      action,
      status: "VERIFIED",
      sameAuthUser: completion.payload.sameAuthUser === true,
      playerIdUnchanged: completion.payload.playerId === expected.playerId,
      emailPreserved: completion.payload.emailPreserved === true,
      message: "Mobile verified on the existing email Auth user. Player Passport ownership is unchanged.",
    }, { headers });
  } catch (error) {
    const code = error?.code || error?.identityDiagnostics?.code || "PHONE_OTP_PROVIDER_UNAVAILABLE";
    const responseCode = action === "start" && code === "PHONE_OTP_AUTH_MISMATCH"
      ? "PHONE_OTP_ENROLLMENT_START_FAILED"
      : code;
    console.error("Participant phone enrollment failed", { code, message: "Participant phone enrollment failed." });
    return errorResponse(responseCode, Number(error?.status) || 409);
  }
}
