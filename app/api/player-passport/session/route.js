import { NextResponse } from "next/server";
import { PLAYER_PASSPORT_COOKIE, playerPassportCookie, playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { resolvePlayerPassportToken } from "../../../../lib/player-passport-server.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const identity = await resolvePlayerPassportToken(playerPassportTokenFromRequest(request));
  return identity
    ? NextResponse.json({ active: true, player: identity.player })
    : NextResponse.json({ active: false }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
  response.cookies.set({ ...playerPassportCookie("", 0), name: PLAYER_PASSPORT_COOKIE });
  return response;
}
