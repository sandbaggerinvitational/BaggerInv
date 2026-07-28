import { NextResponse } from "next/server";
import { validatePlayerPassport } from "../../../../lib/google-sheets-write.js";
import { PLAYER_PASSPORT_COOKIE, playerPassportCookie, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const identity = await validatePlayerPassport(verifyPlayerPassportSession(playerPassportTokenFromRequest(request)));
    return NextResponse.json({ active: true, player: identity.player });
  } catch {
    return NextResponse.json({ active: false }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
  response.cookies.set({ ...playerPassportCookie("", 0), name: PLAYER_PASSPORT_COOKIE });
  return response;
}
