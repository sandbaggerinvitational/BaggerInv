import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../../lib/player-passport-server.js";
import { isTournamentDirector } from "../../../../../lib/player-role.js";
import { appendNotificationLog, currentPushDevice, invalidatePushDevice } from "../../../../../lib/google-sheets-write.js";
import { previewPushConfiguration, sendPreviewPush } from "../../../../../lib/web-push-notifications.js";
import { previewNotificationTemplate } from "../../../../../lib/notification-templates.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!previewPushConfiguration().preview) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let session;
  try { session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request)); } catch { return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 }); }
  const inspected = await inspectPlayerPassportToken(playerPassportTokenFromRequest(request));
  if (inspected.status !== "active" || !isTournamentDirector(inspected.identity)) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
  const input = await request.json().catch(() => ({}));
  const template = previewNotificationTemplate(input?.templateId);
  try {
    const device = await currentPushDevice(session);
    await sendPreviewPush(device.subscription, {
      title: template.title, body: template.body,
      icon: "/icon-192.png", badge: "/icon-192.png", tag: `sbi-preview-${template.id}-${session.deviceId}`, url: template.url,
    });
    await appendNotificationLog(session, { type: template.label, template: template.id, recipient: inspected.identity.player.name, status: "Delivered to push service" });
    return NextResponse.json({ ok: true, template: template.id });
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status);
    if ([404, 410].includes(statusCode)) await invalidatePushDevice(session).catch(() => {});
    const failure = [404, 410].includes(statusCode) ? "Subscription expired" : String(error?.code || "Delivery failed");
    await appendNotificationLog(session, { type: template.label, template: template.id, recipient: inspected.identity.player.name, status: "Failed", failure }).catch(() => {});
    return NextResponse.json({ error: error?.message || "Test notification could not be sent." }, { status: 503 });
  }
}
