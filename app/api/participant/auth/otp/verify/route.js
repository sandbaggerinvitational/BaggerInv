import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../../lib/participant-identity-authority.js";
import { participantAuthEmailHash } from "../../../../../../lib/participant-auth-rehearsal.js";
import { authorizeSingleParticipantOtpVerification, recordSingleParticipantOtpVerification } from "../../../../../../lib/participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "../../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.authRehearsalEnabled || authority.resolved !== "passport") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const input = await request.json().catch(() => ({}));
  const email = String(input.email || "").trim().toLowerCase();
  const token = String(input.token || "").replace(/\s/g, "");
  const requestId = String(input.requestId || "").trim();
  if (!/^\d{6}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: "That code is invalid or expired." }, { status: 400 });
  const allowed = await authorizeSingleParticipantOtpVerification({ request_id: requestId, email_identity_hash: participantAuthEmailHash(email) });
  if (allowed.payload?.allowed !== true) return NextResponse.json({ error: "That code is invalid or expired." }, { status: 400 });
  const config = participantAuthServerConfiguration();
  const pendingCookies = [];
  const client = createServerClient(config.url, config.publishableKey, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => pendingCookies.push(...items),
    },
  });
  const started = performance.now();
  const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
  const matches = !error && data?.user?.id === allowed.payload.authUserId;
  await recordSingleParticipantOtpVerification({ request_id: requestId, auth_user_id: data?.user?.id || null,
    succeeded: matches, duration_ms: Math.round(performance.now() - started) });
  if (!matches) {
    if (data?.session) await client.auth.signOut({ scope: "local" });
    return NextResponse.json({ error: "That code is invalid or expired." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const response = NextResponse.json({ ok: true, session: "active", linkedPlayerId: allowed.payload.playerId,
    sessionEstablishedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
