import { NextResponse } from "next/server";
import { updatePlayerReadiness } from "../../../../lib/google-sheets-write.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let session;
  try {
    session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
  } catch {
    return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
  }
  try {
    const input = await request.json();
    const readiness = await updatePlayerReadiness(session, {
      pwaInstalled: input?.pwaInstalled === true,
      notificationsEnabled: typeof input?.notificationsEnabled === "boolean" ? input.notificationsEnabled : undefined,
    });
    return NextResponse.json({ readiness }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (/no longer active/i.test(String(error?.message || ""))) return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
    return NextResponse.json({ error: "Player readiness could not be updated." }, { status: 503 });
  }
}
