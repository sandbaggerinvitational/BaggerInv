import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getGameCenterData } from "../../../game-center/gameCenterData.js";
import { playerPassportEffectivePlayerId, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const profile = createRuntimeProfile("GET /api/game-center/[matchId]");
  try {
    const { matchId } = await params;
    let currentPlayerId = "";
    const authority = requireParticipantIdentityAuthority();
    await profile.measure("participantIdentity", async () => {
      try {
        currentPlayerId = authority.resolved === "supabase"
          ? (await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() })).playerId
          : playerPassportEffectivePlayerId(verifyPlayerPassportSession(playerPassportTokenFromRequest(request)));
      } catch { currentPlayerId = ""; }
    });
    const data = await profile.measure("gameCenterAssembly", () => getGameCenterData(matchId, currentPlayerId));
    const response = NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    response.headers.set("X-Participant-Identity-Authority", authority.resolved);
    if (authority.resolved === "supabase") response.headers.set("X-Participant-Identity-Google-Requests", "0");
    return attachRuntimeTiming(response, profile.finish({ identityAuthority: authority.resolved,
      googleIdentityRequests: authority.resolved === "supabase" ? 0 : null }));
  } catch (error) {
    profile.finish({ failed: true });
    const status = error?.digest === "NEXT_NOT_FOUND" ? 404 : 503;
    return NextResponse.json(
      { error: status === 404 ? "That match could not be found." : "Game Center is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
