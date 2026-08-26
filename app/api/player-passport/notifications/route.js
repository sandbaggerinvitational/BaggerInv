import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { currentPushDevice, updatePlayerReadiness } from "../../../../lib/google-sheets-write.js";
import { previewPushConfiguration } from "../../../../lib/web-push-notifications.js";
import { withProductionGoogleAuthoringWrite } from "../../../../lib/production-google-authoring.js";
import { GOOGLE_AUTHORING_OPERATIONS } from "../../../../lib/google-workbook-mutation-intent.js";

export const dynamic = "force-dynamic";

function sessionFor(request) {
  return verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
}

export async function GET(request) {
  if (!previewPushConfiguration().preview) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const session = sessionFor(request);
    const device = await currentPushDevice(session);
    const configuration = previewPushConfiguration();
    return NextResponse.json({
      available: configuration.configured,
      publicKey: configuration.publicKey,
      permission: device.row.record["Notification Permission"] || "default",
      subscribed: Boolean(device.subscription), notificationReady: device.ready,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
  }
}

export async function POST(request) {
  if (!previewPushConfiguration().preview) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const session = sessionFor(request);
    const input = await request.json();
    const readiness = await withProductionGoogleAuthoringWrite({
      request,
      operation: GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK,
    }, () => updatePlayerReadiness(session, {
      notificationPermission: input?.permission,
      pushSubscription: input?.subscription ?? null,
    }));
    return NextResponse.json({ readiness }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String(error?.message || "");
    if (/not active|no longer active/i.test(message)) return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
    return NextResponse.json({ error: "Notification readiness could not be updated." }, { status: 503 });
  }
}
