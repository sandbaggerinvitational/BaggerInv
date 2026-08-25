import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../../lib/participant-identity-authority.js";
import { participantAuthEmailHash } from "../../../../../../lib/participant-auth-rehearsal.js";
import { resolveParticipantEmailOtpVerificationType } from "../../../../../../lib/participant-email-otp-mode.js";
import { recordOtpVerificationWithRecovery } from "../../../../../../lib/participant-auth-certification-recovery.js";
import { authorizeSingleParticipantOtpVerification, recordSingleParticipantOtpVerification } from "../../../../../../lib/participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "../../../../../../lib/supabase-auth-server.js";
import { dataAuthorityFetch } from "../../../../../../lib/data-authority-request.js";
import { assertProductionShadowCandidateRequest } from "../../../../../../lib/production-shadow-candidate.js";
import { assertProductionCutoverRequest } from "../../../../../../lib/production-cutover-activation-contract.js";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (payload, status = 200, headers = {}) => NextResponse.json(payload, {
  status,
  headers: { ...responseHeaders, ...headers },
});

function failClosedAuthResponse(request, pendingCookies, payload, status) {
  const response = json(payload, status);
  const authCookieNames = new Set([
    ...request.cookies.getAll().map(({ name }) => name),
    ...pendingCookies.map(({ name }) => name),
  ].filter((name) => /^sb-.*-auth-token(?:\.[0-9]+)?$/i.test(String(name || ""))));
  for (const name of authCookieNames) {
    response.cookies.set({ name, value: "", path: "/", httpOnly: true,
      sameSite: "lax", secure: true, maxAge: 0, expires: new Date(0) });
  }
  return response;
}

function sameOriginMutation(request) {
  const origin = String(request.headers.get("origin") || "").trim();
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").trim().toLowerCase();
  let expectedOrigin = "";
  try { expectedOrigin = new URL(request.url).origin; }
  catch { return false; }
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin");
}

export async function POST(request) {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.participantAuthEnabled) return json({ error: "Not found." }, 404);
  if (authority.productionShadowCandidate) {
    try { assertProductionShadowCandidateRequest(request, process.env, { requireOrigin: true }); }
    catch { return json({ error: "Not found." }, 404); }
  }
  if (authority.productionCutoverIdentity) {
    try { assertProductionCutoverRequest(request, process.env, { requireOrigin: true }); }
    catch { return json({ error: "Not found." }, 404); }
  }
  if (!sameOriginMutation(request)) return json({ error: "We couldn't verify this request. Try again." }, 403);
  const input = await request.json().catch(() => ({}));
  const email = String(input.email || "").trim().toLowerCase();
  const token = String(input.token || "").replace(/\s/g, "");
  const requestId = String(input.requestId || "").trim();
  if (!/^\d{6}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: "That code is invalid or expired.", category: "INVALID_OR_EXPIRED" }, 400);
  const allowed = await authorizeSingleParticipantOtpVerification({ request_id: requestId, email_identity_hash: participantAuthEmailHash(email) });
  if (allowed.payload?.allowed !== true) return json({ error: "That code is invalid or expired.", category: "INVALID_OR_EXPIRED" }, 400);
  let verificationType = "";
  try {
    verificationType = resolveParticipantEmailOtpVerificationType(allowed.payload.verificationType, {
      required: authority.productionShadowCandidate || authority.productionCutoverIdentity,
    });
  } catch {
    return json({ error: "We couldn't verify that code. Try again.", category: "AUTH_SERVICE_UNAVAILABLE" }, 503);
  }
  const config = participantAuthServerConfiguration();
  const pendingCookies = [];
  const client = createServerClient(config.url, config.publishableKey, {
    global: { fetch: dataAuthorityFetch("supabase", { adapter: "participant-email-otp-verify" }) },
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => pendingCookies.push(...items),
    },
  });
  const started = performance.now();
  const { data, error } = await client.auth.verifyOtp({ email, token, type: verificationType });
  const verifyOtpMs = Math.round(performance.now() - started);
  const matches = !error && data?.user?.id === allowed.payload.authUserId;
  try {
    await recordOtpVerificationWithRecovery({ request_id: requestId, auth_user_id: data?.user?.id || null,
      succeeded: matches, duration_ms: verifyOtpMs }, {
      recordVerification: recordSingleParticipantOtpVerification,
      attempts: matches ? 3 : 1,
    });
  } catch (certificationError) {
    if (!matches) {
      if (data?.session) await client.auth.signOut({ scope: "global" }).catch(() => null);
      console.error("Production Auth verification failure audit unavailable", {
        code: certificationError?.identityDiagnostics?.code || "PRODUCTION_AUTH_VERIFICATION_AUDIT_FAILED",
        requestId,
        authUserIdPresent: Boolean(data?.user?.id),
      });
      return failClosedAuthResponse(request, pendingCookies,
        { error: "We couldn't verify that code. Try again.", category: "AUTH_SERVICE_UNAVAILABLE" }, 503);
    }
    // Supabase proved the OTP, but the application certification transaction
    // is the authority boundary. Invalidate the newly issued session and never
    // attach any pending Auth cookies until that transaction is durable.
    await client.auth.signOut({ scope: "global" }).catch(() => null);
    console.error("Production Auth certification write failed closed", {
      code: certificationError?.identityDiagnostics?.code || "PRODUCTION_AUTH_CERTIFICATION_WRITE_FAILED",
      requestId,
      authUserIdPresent: Boolean(data?.user?.id),
    });
    return failClosedAuthResponse(request, pendingCookies,
      { error: "We couldn't finish signing you in. Try again.",
        category: "AUTH_CERTIFICATION_UNAVAILABLE" }, 503);
  }
  if (!matches) {
    if (data?.session) await client.auth.signOut({ scope: "global" }).catch(() => null);
    return failClosedAuthResponse(request, pendingCookies,
      { error: "That code is invalid or expired.", category: "INVALID_OR_EXPIRED" }, 400);
  }
  const totalMs = Math.round(performance.now() - started);
  const response = NextResponse.json({ ok: true, session: "active", linkedPlayerId: allowed.payload.playerId,
    certification: "VERIFIED",
    sessionEstablishedAt: new Date().toISOString(), timings: { verifyOtpMs, totalMs } },
    { status: 200,
      headers: { ...responseHeaders, "Server-Timing": `verifyOtp;dur=${verifyOtpMs}, total;dur=${totalMs}` } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
