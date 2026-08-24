import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PLAYER_PASSPORT_COOKIE, playerPassportCookie, playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../lib/player-passport-server.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { isRecoverablePreviewImpersonationCode } from "../../../../lib/participant-impersonation-recovery.js";
import { createParticipantAuthServerClient } from "../../../../lib/supabase-auth-server.js";
import { SCORING_SESSION_COOKIE, scoringSessionCookie } from "../../../../lib/scoring-access.js";
import { applicationRequestEnvironment } from "../../../../lib/production-shadow-request-environment.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const env = applicationRequestEnvironment(request);
  let authority;
  try { authority = requireParticipantIdentityAuthority(env); }
  catch (error) {
    const safe = participantIdentityPublicError(error);
    return NextResponse.json({ active: null, error: safe.message, code: safe.code }, { status: safe.status });
  }
  if (authority.resolved === "supabase") {
    try {
      const resolved = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies(), env });
      const response = NextResponse.json({
        active: true,
        identityAuthority: "supabase",
        player: {
          id: resolved.playerId,
          name: resolved.displayName,
          teamName: resolved.context.team?.name || "",
        },
        tournament: resolved.context.tournament,
        impersonation: resolved.previewMode ? { active: true, player: {
          id: resolved.playerId, name: resolved.displayName,
        }, director: resolved.impersonation?.director || null, expiresAt: resolved.impersonation?.expiresAt || null } : null,
        identityTimings: resolved.timings,
      }, { headers: { "Cache-Control": "private, no-store" } });
      response.headers.set("X-Participant-Identity-Authority", "supabase");
      response.headers.set("X-Participant-Identity-Google-Requests", "0");
      return response;
    } catch (error) {
      const safe = participantIdentityPublicError(error);
      const response = NextResponse.json({ active: safe.status === 401 ? false : null, error: safe.message, code: safe.code },
        { status: safe.status, headers: { "Cache-Control": "private, no-store", "X-Participant-Identity-Authority": "supabase", "X-Participant-Identity-Google-Requests": "0" } });
      if (process.env.VERCEL_ENV === "preview" && isRecoverablePreviewImpersonationCode(safe.code)) {
        response.cookies.set({ ...playerPassportCookie("", 0), name: PLAYER_PASSPORT_COOKIE });
        response.headers.set("X-Preview-Impersonation-Recovery", "cookie-cleared");
      }
      return response;
    }
  }
  const result = await inspectPlayerPassportToken(playerPassportTokenFromRequest(request));
  if (result.status === "active") {
    return NextResponse.json({
      active: true,
      player: result.identity.player,
      impersonation: result.identity.impersonating ? {
        active: true,
        player: result.identity.player,
        director: result.identity.actor,
      } : null,
    });
  }
  if (result.status === "unavailable") {
    return NextResponse.json(
      { active: null, error: "Player Passport could not be revalidated." },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
  return NextResponse.json({ active: false }, { status: 401 });
}

export async function DELETE(request) {
  const env = applicationRequestEnvironment(request);
  const authority = requireParticipantIdentityAuthority(env);
  if (authority.resolved === "supabase") {
    const cookieStore = await cookies();
    const client = createParticipantAuthServerClient(cookieStore, env);
    await client.auth.signOut({ scope: "global" });
    const response = NextResponse.json({ cleared: true, identityAuthority: "supabase" },
      { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set({ ...scoringSessionCookie("", 0), name: SCORING_SESSION_COOKIE });
    return response;
  }
  const response = NextResponse.json({ cleared: true });
  response.cookies.set({ ...playerPassportCookie("", 0), name: PLAYER_PASSPORT_COOKIE });
  return response;
}
