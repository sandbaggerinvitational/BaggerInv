import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../../lib/participant-identity-authority.js";
import { participantAuthClientRequestHash, participantAuthGenericMessage } from "../../../../../../lib/participant-auth-rehearsal.js";
import { authorizeSingleParticipantOtpRequest, recordSingleParticipantOtpDelivery } from "../../../../../../lib/participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "../../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";
const json = (payload, status = 200) => NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request) {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.authRehearsalEnabled || authority.resolved !== "passport") return json({ error: "Not found." }, 404);
  const input = await request.json().catch(() => ({}));
  const email = String(input.email || "").trim().toLowerCase();
  const clientIdentity = `${request.headers.get("x-forwarded-for") || ""}|${request.headers.get("user-agent") || ""}|${process.env.SUPABASE_SCORING_MIRROR_SECRET_KEY || ""}`;
  const authorization = await authorizeSingleParticipantOtpRequest({ email, client_request_hash: participantAuthClientRequestHash(clientIdentity) });
  const decision = authorization.payload || {};
  if (!decision.requestId) return json({ message: participantAuthGenericMessage(), step: "code" });
  if (decision.allowed !== true) return json({ message: participantAuthGenericMessage(), step: "code", requestId: decision.requestId });
  const started = performance.now();
  const config = participantAuthServerConfiguration();
  const client = createClient(config.url, config.publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { error } = await client.auth.signInWithOtp({ email: decision.email, options: { shouldCreateUser: false } });
  await recordSingleParticipantOtpDelivery({ request_id: decision.requestId, succeeded: !error,
    safe_reason: error ? "AUTH_EMAIL_PROVIDER_REJECTED" : "DELIVERY_ACCEPTED", duration_ms: Math.round(performance.now() - started) });
  if (error) return json({ message: "The Preview sign-in email could not be delivered. No account was created.", step: "email" }, 503);
  return json({ message: participantAuthGenericMessage(), step: "code", requestId: decision.requestId });
}
