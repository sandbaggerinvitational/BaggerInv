import { NextResponse } from "next/server";
import { isPreviewImpersonationSession, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { initializeParticipantTournament } from "../../../../lib/participant-initialization.js";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance.js";
import { withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { withNormalizedReadDiagnostics } from "../../../../lib/google-sheets-server-read.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const profile = createRuntimeProfile("GET /api/player-passport/initialize");
  const requestStartedAt = Date.now();
  const sessionStartedAt = Date.now();
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
