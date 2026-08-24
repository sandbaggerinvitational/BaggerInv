import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../../lib/participant-identity-authority.js";
import { classifyParticipantEmailOtpAuthError, participantAuthClientRequestHash, participantAuthGenericMessage, participantAuthRateLimitSecret } from "../../../../../../lib/participant-auth-rehearsal.js";
import { authorizeParticipantEmailOtpEligibility } from "../../../../../../lib/participant-email-otp-authorization.js";
import { requestParticipantEmailOtp, resolveParticipantEmailOtpVerificationType } from "../../../../../../lib/participant-email-otp-mode.js";
import { recordSingleParticipantOtpDelivery } from "../../../../../../lib/participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "../../../../../../lib/supabase-auth-server.js";
import { normalizeParticipantAuthCaptchaToken } from "../../../../../../lib/participant-phone-otp.js";
import { participantAuthExperienceConfiguration } from "../../../../../../lib/participant-sms-auth-feature.js";
import { dataAuthorityFetch } from "../../../../../../lib/data-authority-request.js";
import { assertProductionShadowCandidateRequest } from "../../../../../../lib/production-shadow-candidate.js";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (payload, status = 200) => NextResponse.json(payload, { status, headers: responseHeaders });
const publicRequestMinimumDurationMs = 750;

async function enumerationSafeRequestResponse(startedAt, requestId) {
  const remaining = publicRequestMinimumDurationMs - Math.round(performance.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return json({ message: participantAuthGenericMessage(), step: "code", requestId: requestId || randomUUID() });
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
  if (!sameOriginMutation(request)) return json({ error: "We couldn't verify this request. Try again.", category: "REQUEST_CHECK_FAILED" }, 403);
  const input = await request.json().catch(() => ({}));
  const email = String(input.email || "").trim().toLowerCase();
  const experience = participantAuthExperienceConfiguration();
  let captchaToken = "";
  try { captchaToken = normalizeParticipantAuthCaptchaToken(input.captchaToken, { required: experience.captchaRequired }); }
  catch { return json({ error: "We couldn't verify this request. Try again.", category: "REQUEST_CHECK_FAILED" }, 400); }
  const publicRequestStartedAt = performance.now();
  const clientIdentity = `${request.headers.get("x-forwarded-for") || ""}|${request.headers.get("user-agent") || ""}`;
  let clientRequestHash = "";
  try {
    clientRequestHash = participantAuthClientRequestHash(clientIdentity, { secret: participantAuthRateLimitSecret() });
  } catch (error) {
    console.error("Participant email Auth configuration unavailable", { code: error?.code || "AUTH_CONFIGURATION_FAILURE" });
    return json({ message: "Email sign-in is temporarily unavailable. Try again shortly.", category: "EMAIL_UNAVAILABLE" }, 503);
  }
  const eligibility = await authorizeParticipantEmailOtpEligibility({ email, client_request_hash: clientRequestHash });
  if (!eligibility.ok) {
    console.error("Participant email authorization unavailable", eligibility.diagnostics);
    return json({
      message: "Email sign-in is temporarily unavailable. Try again shortly.",
      category: "EMAIL_UNAVAILABLE",
      step: "email",
    }, 503);
  }
  const authorization = eligibility.authorization;
  const decision = authorization.payload || {};
  if (!decision.requestId) return enumerationSafeRequestResponse(publicRequestStartedAt, randomUUID());
  if (decision.allowed !== true) return enumerationSafeRequestResponse(publicRequestStartedAt, decision.requestId);
  let pipelineError = null;
  try {
    const started = performance.now();
    const config = participantAuthServerConfiguration();
    const client = createClient(config.url, config.publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: dataAuthorityFetch("supabase", { adapter: "participant-email-otp-request" }) },
    });
    const verificationType = resolveParticipantEmailOtpVerificationType(decision.verificationType, {
      required: authority.productionShadowCandidate,
    });
    let error = null;
    ({ error } = await requestParticipantEmailOtp(client, {
      email: decision.email,
      captchaToken,
      verificationType,
    }));
    const authFailure = error ? classifyParticipantEmailOtpAuthError(error) : null;
    await recordSingleParticipantOtpDelivery({ request_id: decision.requestId, succeeded: !error,
      safe_reason: authFailure?.safeReason || "DELIVERY_ACCEPTED", duration_ms: Math.round(performance.now() - started) });
    if (error) {
      console.error("Participant email delivery unavailable", {
        safeReason: authFailure.safeReason,
        providerErrorClass: authFailure.providerErrorClass,
        requestId: decision.requestId,
      });
    }
  } catch (error) {
    pipelineError = error;
  }
  if (pipelineError) {
    console.error("Participant email delivery pipeline failed closed", {
      code: String(pipelineError?.code || pipelineError?.identityDiagnostics?.code || "AUTH_EMAIL_DELIVERY_PIPELINE_FAILED").slice(0, 80),
      requestId: decision.requestId,
    });
  }
  // Once an identifier has been evaluated, every public outcome is identical.
  // Exact CAPTCHA/provider/configuration failures remain in the private audit.
  return enumerationSafeRequestResponse(publicRequestStartedAt, decision.requestId);
}
