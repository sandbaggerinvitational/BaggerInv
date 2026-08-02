import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../../lib/player-passport-server.js";
import { isTournamentDirector } from "../../../../../lib/player-role.js";
import { appendNotificationLog, currentPushDevice, invalidatePushDevice } from "../../../../../lib/google-sheets-write.js";
import { previewPushConfiguration, sendPreviewPush } from "../../../../../lib/web-push-notifications.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!previewPushConfiguration().preview) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let session;
  try { session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request)); } catch { return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 }); }
  const inspected = await inspectPlayerPassportToken(playerPassportTokenFromRequest(request));
  if (inspected.status !== "active" || !isTournamentDirector(inspected.identity)) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
  try {
    const device = await currentPushDevice(session);
    await sendPreviewPush(device.subscription, {
      title: "🏌️ Sandbagger Invitational", body: "Notifications are configured successfully.",
      icon: "/icon-192.png", badge: "/icon-192.png", tag: `sbi-test-${session.deviceId}`, url: "/admin/director",
    });
    await appendNotificationLog(session, { type: "Test Notification", recipient: inspected.identity.player.name, status: "Delivered to push service" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status);
    if ([404, 410].includes(statusCode)) await invalidatePushDevice(session).catch(() => {});
    const failure = [404, 410].includes(statusCode) ? "Subscription expired" : String(error?.code || "Delivery failed");
    await appendNotificationLog(session, { type: "Test Notification", recipient: inspected.identity.player.name, status: "Failed", failure }).catch(() => {});
    return NextResponse.json({ error: error?.message || "Test notification could not be sent." }, { status: 503 });
  }
}
