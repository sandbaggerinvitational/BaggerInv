import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../lib/participant-identity-authority.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../lib/player-passport-server.js";
import { readParticipantIdentityContext, readParticipantIdentityContextForAuth } from "../../../../lib/participant-identity-supabase.js";
import { observeParticipantIdentityShadow } from "../../../../lib/participant-identity-shadow.js";
import { verifyParticipantAuthClaims } from "../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

function response(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
async function passportShadowDiagnostics({ authority, passportContext, tournamentId }) {
  const timings = {};
  if (!authority.authRehearsalEnabled || !authority.publicAuthConfigured) {
    return { supabaseAuth: { sessionPresent: false, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
  }
  try {
    const sessionStarted = performance.now();
    const verified = await verifyParticipantAuthClaims(await cookies());
    timings.supabaseSessionVerificationMs = Math.round(performance.now() - sessionStarted);
    if (verified.status !== "active") return { supabaseAuth: { sessionPresent: false, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
    const contextStarted = performance.now();
    const recordStarted = performance.now();
    const observed = await observeParticipantIdentityShadow({
      authUserId: verified.claims.sub,
      tournamentId,
      passportPlayerId: passportContext.playerId,
      passportContext,
    });
    timings.supabaseLinkedContextMs = Math.round(performance.now() - contextStarted);
    timings.shadowObservationMs = Math.round(performance.now() - recordStarted);
    return { supabaseAuth: { sessionPresent: true, linkedPlayerId: observed.linkedPlayerId || null },
      shadowComparison: { status: observed.status, diagnostics: observed.diagnostics || {} }, timings };
  } catch (error) {
    console.error("Participant Auth shadow comparison unavailable", { message: error?.message || String(error) });
    return { supabaseAuth: { sessionPresent: false, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
  }
}
export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Not found." }, 404);
  const authority = participantIdentityAuthorityEnvironment();
  try {
    if (authority.resolved === "supabase") {
      const verified = await verifyParticipantAuthClaims(await cookies());
      if (verified.status !== "active") return response({ identityAuthority: "supabase", session: { status: verified.status }, error: "Participant session is not active." }, 401);
      const result = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub });
      if (!result.payload?.ok) return response({ identityAuthority: "supabase", session: { status: "active" }, error: result.payload?.code || "Participant context is unavailable." }, 403);
      return response({ identityAuthority: "supabase", session: { status: "active" }, ...result.payload.data });
    }

    const token = playerPassportTokenFromRequest(request);
    let signed;
    try { signed = verifyPlayerPassportSession(token); }
    catch { return response({ identityAuthority: "passport", session: { status: "inactive" }, error: "Player Passport is not active." }, 401); }
    const passportStarted = performance.now();
    const verified = await inspectPlayerPassportToken(token);
    const passportVerificationMs = Math.round(performance.now() - passportStarted);
    if (verified.status === "unavailable") return response({ identityAuthority: "passport", session: { status: "unavailable" }, error: "Participant context is temporarily unavailable." }, 503);
    if (verified.status !== "active") return response({ identityAuthority: "passport", session: { status: "inactive" }, error: "Player Passport is not active." }, 401);
    const playerId = verified.identity?.player?.id || signed.playerId;
    const contextStarted = performance.now();
    const result = await readParticipantIdentityContext({ tournamentId: signed.tournamentId, playerId });
    const passportContextMs = Math.round(performance.now() - contextStarted);
    if (!result.payload?.ok) return response({ identityAuthority: "passport", session: { status: "active" }, error: result.payload?.code || "Participant context is unavailable." }, 404);
    const shadow = await passportShadowDiagnostics({ authority, passportContext: result.payload.data, tournamentId: signed.tournamentId });
    return response({ identityAuthority: "passport", session: { status: "active" }, ...result.payload.data,
      supabaseAuth: shadow.supabaseAuth, shadowComparison: shadow.shadowComparison,
      identityTimings: { passportVerificationMs, passportContextMs, ...shadow.timings } });
  } catch (error) {
    console.error("Participant context foundation failed", { authority: authority.resolved, message: error?.message || String(error) });
    return response({ identityAuthority: authority.resolved, session: { status: "unavailable" }, error: "Participant context is temporarily unavailable." }, 503);
  }
}
