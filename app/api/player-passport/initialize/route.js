import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { initializeParticipantTournament } from "../../../../lib/participant-initialization.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  let session;
  try {
    session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
  } catch {
    return NextResponse.json({ active: false }, { status: 401 });
  }
  try {
    const initialized = await initializeParticipantTournament(session);
    return NextResponse.json({ active: true, player: initialized.player, data: initialized.personalized });
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
