import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../../lib/participant-identity-authority.js";
import { participantAuthEmailHash } from "../../../../../../lib/participant-auth-rehearsal.js";
import { authorizeSingleParticipantOtpVerification, recordSingleParticipantOtpVerification } from "../../../../../../lib/participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "../../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (payload, status = 200, headers = {}) => NextResponse.json(payload, {
  status,
  headers: { ...responseHeaders, ...headers },
});

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
  if (!sameOriginMutation(request)) return json({ error: "We couldn't verify this request. Try again." }, 403);
  const input = await request.json().catch(() => ({}));
  const email = String(input.email || "").trim().toLowerCase();
  const token = String(input.token || "").replace(/\s/g, "");
  const requestId = String(input.requestId || "").trim();
  if (!/^\d{6}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: "That code is invalid or expired.", category: "INVALID_OR_EXPIRED" }, 400);
  const allowed = await authorizeSingleParticipantOtpVerification({ request_id: requestId, email_identity_hash: participantAuthEmailHash(email) });
  if (allowed.payload?.allowed !== true) return json({ error: "That code is invalid or expired.", category: "INVALID_OR_EXPIRED" }, 400);
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
  const verifyOtpMs = Math.round(performance.now() - started);
  const matches = !error && data?.user?.id === allowed.payload.authUserId;
  await recordSingleParticipantOtpVerification({ request_id: requestId, auth_user_id: data?.user?.id || null,
    succeeded: matches, duration_ms: verifyOtpMs });
  if (!matches) {
    if (data?.session) await client.auth.signOut({ scope: "local" });
    return json({ error: "That code is invalid or expired.", category: "INVALID_OR_EXPIRED" }, 400);
  }
  const totalMs = Math.round(performance.now() - started);
  const response = NextResponse.json({ ok: true, session: "active", linkedPlayerId: allowed.payload.playerId,
    sessionEstablishedAt: new Date().toISOString(), timings: { verifyOtpMs, totalMs } },
    { headers: { ...responseHeaders, "Server-Timing": `verifyOtp;dur=${verifyOtpMs}, total;dur=${totalMs}` } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
