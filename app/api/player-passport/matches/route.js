import { NextResponse } from "next/server";
import { authorizePassportMatch, readPlayerPassportMatches } from "../../../../lib/google-sheets-write.js";
import { createScoringSession, scoringSessionCookie } from "../../../../lib/scoring-access.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";

export const dynamic = "force-dynamic";

function passport(request) {
  return verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
}

export async function GET(request) {
  let session;
  try {
    session = passport(request);
  } catch {
    return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await readPlayerPassportMatches(session) });
  } catch (error) {
    if (/no longer active|not active in this tournament/i.test(String(error?.message || ""))) {
      return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
    }
    return NextResponse.json(
      { error: "We couldn’t verify your Player Passport right now.", transient: true },
      { status: 503, headers: { "retry-after": "1" } }
    );
  }
}

export async function POST(request) {
  let session;
  try {
    session = passport(request);
  } catch {
    return NextResponse.json({ error: "This match is not available for Player Passport scoring." }, { status: 403 });
  }
  try {
    const { matchId } = await request.json();
    const access = await authorizePassportMatch(session, matchId);
    const token = createScoringSession({ scope: "match", matchId: access.matchId, accessVersion: access.accessVersion, scorerName: access.player.name });
    const response = NextResponse.json({ authorized: true });
    response.cookies.set(scoringSessionCookie(token));
    return response;
  } catch (error) {
    if (/not available|not active|not assigned/i.test(String(error?.message || ""))) {
      return NextResponse.json({ error: "This match is not available for Player Passport scoring." }, { status: 403 });
    }
    return NextResponse.json(
      { error: "We couldn’t verify your Player Passport right now.", transient: true },
      { status: 503, headers: { "retry-after": "1" } }
    );
  }
}
