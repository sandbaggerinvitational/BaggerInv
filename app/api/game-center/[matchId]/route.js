import { NextResponse } from "next/server";
import { getGameCenterData } from "../../../game-center/gameCenterData.js";
import { playerPassportEffectivePlayerId, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const profile = createRuntimeProfile("GET /api/game-center/[matchId]");
  try {
    const { matchId } = await params;
    let currentPlayerId = "";
    await profile.measure("passportSignedSession", async () => {
      try { currentPlayerId = playerPassportEffectivePlayerId(verifyPlayerPassportSession(playerPassportTokenFromRequest(request))); }
      catch { currentPlayerId = ""; }
    });
    const data = await profile.measure("gameCenterAssembly", () => getGameCenterData(matchId, currentPlayerId));
    return attachRuntimeTiming(NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } }), profile.finish());
  } catch (error) {
    profile.finish({ failed: true });
    const status = error?.digest === "NEXT_NOT_FOUND" ? 404 : 503;
    return NextResponse.json(
      { error: status === 404 ? "That match could not be found." : "Game Center is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
