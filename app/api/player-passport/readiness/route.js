import { NextResponse } from "next/server";
import { updatePlayerReadiness } from "../../../../lib/google-sheets-write.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { withProductionGoogleAuthoringWrite } from "../../../../lib/production-google-authoring.js";
import { GOOGLE_AUTHORING_OPERATIONS } from "../../../../lib/google-workbook-mutation-intent.js";

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
    const readiness = await withProductionGoogleAuthoringWrite({
      request,
      operation: GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK,
    }, () => updatePlayerReadiness(session, {
      pwaInstalled: input?.pwaInstalled === true,
      notificationsEnabled: typeof input?.notificationsEnabled === "boolean" ? input.notificationsEnabled : undefined,
    }));
    return NextResponse.json({ readiness }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (/no longer active/i.test(String(error?.message || ""))) return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
    return NextResponse.json({ error: "Player readiness could not be updated." }, { status: 503 });
  }
}
