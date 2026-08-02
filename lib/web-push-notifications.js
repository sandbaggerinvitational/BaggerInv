import webpush from "web-push";

const clean = (value) => String(value ?? "").trim();

export function previewPushConfiguration() {
  const preview = process.env.VERCEL_ENV === "preview";
  const publicKey = clean(process.env.WEB_PUSH_PUBLIC_KEY);
  const privateKey = clean(process.env.WEB_PUSH_PRIVATE_KEY);
  return {
    preview,
    configured: preview && Boolean(publicKey && privateKey),
    publicKey: preview ? publicKey : "",
  };
}

export function parsePushSubscription(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed?.endpoint || !parsed?.keys?.p256dh || !parsed?.keys?.auth) return null;
    return { endpoint: String(parsed.endpoint), expirationTime: parsed.expirationTime || null, keys: { p256dh: String(parsed.keys.p256dh), auth: String(parsed.keys.auth) } };
  } catch {
    return null;
  }
}

export function notificationReady(record = {}) {
  return clean(record["Notification Permission"]).toLowerCase() === "granted" && Boolean(parsePushSubscription(record["Push Subscription"]));
}

export async function sendPreviewPush(subscription, payload) {
  const configuration = previewPushConfiguration();
  if (!configuration.configured) throw Object.assign(new Error("Preview push notifications are not configured."), { code: "PUSH_NOT_CONFIGURED" });
  const parsed = parsePushSubscription(subscription);
  if (!parsed) throw Object.assign(new Error("This device does not have a valid push subscription."), { code: "PUSH_SUBSCRIPTION_INVALID" });
  webpush.setVapidDetails(clean(process.env.WEB_PUSH_SUBJECT) || "mailto:notifications@baggerinv.com", configuration.publicKey, clean(process.env.WEB_PUSH_PRIVATE_KEY));
  return webpush.sendNotification(parsed, JSON.stringify(payload), { TTL: 60, urgency: "normal" });
}
