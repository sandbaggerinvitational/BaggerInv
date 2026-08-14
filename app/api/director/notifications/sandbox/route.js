import { NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../../../lib/preview-director-authorization.js";
import { appendNotificationLog, currentPushDevice, invalidatePushDevice } from "../../../../../lib/google-sheets-write.js";
import { previewPushConfiguration, sendPreviewPush } from "../../../../../lib/web-push-notifications.js";
import { notificationPreviewContextForPlayer, previewNotificationTemplate } from "../../../../../lib/notification-templates.js";
import { getTournamentData } from "../../../../live/sheetData.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!previewPushConfiguration().preview) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const inspected = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (inspected.status === "unavailable") return NextResponse.json({ error: "Tournament Director identity could not be verified right now. Retry." }, { status: 503 });
  if (inspected.status !== "active") return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
  const session = inspected.identity.session;
  if (session.type !== "player-passport") {
    return NextResponse.json({ error: "This notification test still requires the legacy registered device context." }, { status: 409 });
  }
  const input = await request.json().catch(() => ({}));
  const tournamentData = await getTournamentData();
  const template = previewNotificationTemplate(input?.templateId, notificationPreviewContextForPlayer(tournamentData, inspected.identity.player));
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
