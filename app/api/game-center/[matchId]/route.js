import { NextResponse } from "next/server";
import { getGameCenterData } from "../../../game-center/gameCenterData.js";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { resolvePlayerPassportToken } from "../../../../lib/player-passport-server.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { matchId } = await params;
    const identity = await resolvePlayerPassportToken(playerPassportTokenFromRequest(request));
    return NextResponse.json(
      { data: await getGameCenterData(matchId, identity?.player?.id || "") },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error?.digest === "NEXT_NOT_FOUND" ? 404 : 503;
    return NextResponse.json(
      { error: status === 404 ? "That match could not be found." : "Game Center is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
