import { NextResponse } from "next/server";
import { getGameCenterData } from "../../../game-center/gameCenterData.js";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { resolvePlayerPassportToken } from "../../../../lib/player-passport-server.js";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const profile = createRuntimeProfile("GET /api/game-center/[matchId]");
  try {
    const { matchId } = await params;
    const identity = await profile.measure("passport", () => resolvePlayerPassportToken(playerPassportTokenFromRequest(request)));
    const data = await profile.measure("gameCenterAssembly", () => getGameCenterData(matchId, identity?.player?.id || ""));
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
