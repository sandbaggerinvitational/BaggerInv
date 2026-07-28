import { NextResponse } from "next/server";
import { authorizePassportMatch, readPlayerPassportMatches } from "../../../../lib/google-sheets-write.js";
import { createScoringSession, scoringSessionCookie } from "../../../../lib/scoring-access.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";

export const dynamic = "force-dynamic";

function passport(request) {
  return verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
}

export async function GET(request) {
  try {
    return NextResponse.json({ data: await readPlayerPassportMatches(passport(request)) });
  } catch {
    return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const { matchId } = await request.json();
    const access = await authorizePassportMatch(passport(request), matchId);
    const token = createScoringSession({ scope: "match", matchId: access.matchId, accessVersion: access.accessVersion, scorerName: access.player.name });
    const response = NextResponse.json({ authorized: true });
    response.cookies.set(scoringSessionCookie(token));
    return response;
  } catch {
    return NextResponse.json({ error: "This match is not available for Player Passport scoring." }, { status: 403 });
  }
}
