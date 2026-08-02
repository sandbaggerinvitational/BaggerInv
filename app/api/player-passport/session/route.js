import { NextResponse } from "next/server";
import { PLAYER_PASSPORT_COOKIE, playerPassportCookie, playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../lib/player-passport-server.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
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

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
  response.cookies.set({ ...playerPassportCookie("", 0), name: PLAYER_PASSPORT_COOKIE });
  return response;
}
