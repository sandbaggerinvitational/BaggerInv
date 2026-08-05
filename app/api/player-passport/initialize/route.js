import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { initializeParticipantTournament } from "../../../../lib/participant-initialization.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
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
    const initialized = await initializeParticipantTournament(session);
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
    });
    const response = NextResponse.json({ active: true, player: initialized.player, data: initialized.personalized });
    response.headers.set("Server-Timing", [
      `session;dur=${timing.sessionValidationMs}`,
      `passport;dur=${timing.passportLookupMs}`,
      `tournament;dur=${timing.tournamentDataMs}`,
      `personalized;dur=${timing.personalizedDataMs}`,
      `total;dur=${timing.totalHomeLoadMs}`,
    ].join(", "));
    response.headers.set("X-Home-Initialization-Cache", timing.cacheHit ? "hit" : "miss");
    return response;
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
