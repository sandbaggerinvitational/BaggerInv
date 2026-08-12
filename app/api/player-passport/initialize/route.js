import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isPreviewImpersonationSession, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { initializeParticipantTournament } from "../../../../lib/participant-initialization.js";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance.js";
import { withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { withNormalizedReadDiagnostics } from "../../../../lib/google-sheets-server-read.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { myMatchDataFromSupabaseView, readMyMatchView } from "../../../../lib/my-match-supabase.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const profile = createRuntimeProfile("GET /api/player-passport/initialize");
  const requestStartedAt = Date.now();
  const sessionStartedAt = Date.now();
  let identityAuthority;
  try { identityAuthority = requireParticipantIdentityAuthority(); }
  catch (error) {
    const safe = participantIdentityPublicError(error);
    return NextResponse.json({ active: null, error: safe.message, code: safe.code }, { status: safe.status });
  }
  if (identityAuthority.resolved === "supabase") {
    try {
      const resolved = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() });
      const read = await readMyMatchView({ tournamentId: resolved.tournamentId, playerId: resolved.playerId });
      if (!read.payload?.ok) throw Object.assign(new Error("Participant context is unavailable."), { code: read.payload?.code });
      const personalized = myMatchDataFromSupabaseView(read.payload.data);
      const totalHomeLoadMs = Date.now() - requestStartedAt;
      const response = NextResponse.json({ active: true, previewMode: resolved.previewMode,
        player: personalized.player, data: personalized,
        identityAuthority: "supabase" });
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Participant-Identity-Authority", "supabase");
      response.headers.set("X-Participant-Identity-Google-Requests", "0");
      response.headers.set("Server-Timing", `session;dur=${Number(resolved.timings.sessionVerificationMs || 0).toFixed(1)}, context;dur=${Number(resolved.timings.participantContextMs || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || 0).toFixed(1)}, total;dur=${totalHomeLoadMs}`);
      return attachRuntimeTiming(response, profile.finish({ identityAuthority: "supabase", googleIdentityRequests: 0,
        sessionValidationMs: resolved.timings.sessionVerificationMs || 0, participantContextMs: resolved.timings.participantContextMs || 0,
        supabaseServiceMs: read.durationMs || 0, totalHomeLoadMs }));
    } catch (error) {
      const safe = participantIdentityPublicError(error);
      return NextResponse.json({ active: safe.status === 401 ? false : null, initializing: safe.status !== 401,
        error: safe.message, code: safe.code }, { status: safe.status, headers: { "retry-after": "1",
          "X-Participant-Identity-Authority": "supabase", "X-Participant-Identity-Google-Requests": "0" } });
    }
  }
  let session;
  try {
    session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
  } catch {
    return NextResponse.json({ active: false }, { status: 401 });
  }
  const sessionValidationMs = Date.now() - sessionStartedAt;
  try {
    const measured = await withWorkbookWriteDiagnostics("participant-home-initialization", () =>
      withNormalizedReadDiagnostics("GET /api/player-passport/initialize", () => initializeParticipantTournament(session))
    );
    const initialized = measured.result.result;
    const totalHomeLoadMs = Date.now() - requestStartedAt;
    const timing = {
      sessionValidationMs,
      tournamentDataMs: initialized.timing?.tournamentDataMs || 0,
      passportLookupMs: initialized.timing?.passportLookupMs || 0,
      personalizedDataMs: initialized.timing?.personalizedDataMs || 0,
      totalHomeLoadMs,
      cacheHit: Boolean(initialized.timing?.cacheHit),
    };
    const slowestStage = Object.entries(timing)
      .filter(([key, value]) => key.endsWith("Ms") && key !== "totalHomeLoadMs" && Number.isFinite(value))
      .sort((left, right) => right[1] - left[1])[0]?.[0] || "unknown";
    console.info("Participant Home initialization timing", {
      tournamentId: session.tournamentId,
      ...timing,
      slowestStage,
      workbookAccess: {
        normalized: measured.result.diagnostics,
        authenticated: measured.diagnostics,
      },
    });
    const response = NextResponse.json({ active: true, previewMode: isPreviewImpersonationSession(session), player: initialized.player, data: initialized.personalized });
    response.headers.set("Server-Timing", [
      `session;dur=${timing.sessionValidationMs}`,
      `passport;dur=${timing.passportLookupMs}`,
      `tournament;dur=${timing.tournamentDataMs}`,
      `personalized;dur=${timing.personalizedDataMs}`,
      `total;dur=${timing.totalHomeLoadMs}`,
    ].join(", "));
    response.headers.set("X-Home-Initialization-Cache", timing.cacheHit ? "hit" : "miss");
    return attachRuntimeTiming(response, profile.finish({ ...timing, cache: timing.cacheHit ? "hit" : "miss" }));
  } catch (error) {
    if (/no longer active|not active in this tournament/i.test(String(error?.message || ""))) {
      return NextResponse.json({ active: false }, { status: 401 });
    }
    console.error("Participant tournament initialization failed", {
      tournamentId: session.tournamentId,
      playerId: session.impersonatedPlayerId || session.playerId,
      reason: error?.message || String(error),
    });
    return NextResponse.json(
      { active: null, initializing: true },
      { status: 503, headers: { "retry-after": "1" } }
    );
  }
}
