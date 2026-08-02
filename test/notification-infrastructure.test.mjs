import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notificationReady, parsePushSubscription, previewPushConfiguration } from "../lib/web-push-notifications.js";
import { tournamentReadiness } from "../lib/tournament-readiness.js";
import { NOTIFICATION_TEMPLATE_OPTIONS, NOTIFICATION_TITLE, previewNotificationTemplate } from "../lib/notification-templates.js";

const valid = { endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "secret" } };

test("notification readiness requires granted permission and a valid subscription", () => {
  assert.deepEqual(parsePushSubscription(JSON.stringify(valid)), { ...valid, expirationTime: null });
  assert.equal(notificationReady({ "Notification Permission": "granted", "Push Subscription": JSON.stringify(valid) }), true);
  assert.equal(notificationReady({ "Notification Permission": "granted", "Push Subscription": "" }), false);
  assert.equal(notificationReady({ "Notification Permission": "denied", "Push Subscription": JSON.stringify(valid) }), false);
});

test("Director readiness identifies granted permission with an invalid subscription", () => {
  const model = tournamentReadiness({ tournamentId: "T1", players: [{ id: "P1", name: "Player One" }], devices: [{ "Tournament ID": "T1", "Player ID": "P1", "Expires At": "2099-01-01", "Notification Permission": "granted", "Push Subscription": "invalid" }] });
  const notifications = model.items.find((item) => item.id === "notifications");
  assert.equal(notifications.complete, 0);
  assert.deepEqual(notifications.invalid, [{ id: "P1", name: "Player One" }]);
});

test("push configuration never exposes keys outside Preview", () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  assert.deepEqual(previewPushConfiguration(), { preview: false, configured: false, publicKey: "" });
  process.env.VERCEL_ENV = previous;
});

test("service worker, participant subscription, Director sandbox, and log are wired without automatic triggers", async () => {
  const [worker, banner, playerRoute, testRoute, director, writer] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/PlayerSetupBanner.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/notifications/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/director/notifications/sandbox/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /payload\.title \|\| "The Bagger"/);
  assert.match(banner, /pushManager\.subscribe/);
  const pushFlow = banner.slice(banner.indexOf("async function syncPushSubscription"), banner.indexOf("function standalone"));
  assert.ok(pushFlow.indexOf("Notification.requestPermission()") < pushFlow.indexOf('fetch("/api/player-passport/notifications"'), "permission must be requested before the first awaited network call");
  assert.match(playerRoute, /currentPushDevice/);
  assert.match(playerRoute, /previewPushConfiguration\(\)\.preview/);
  assert.match(testRoute, /previewPushConfiguration\(\)\.preview/);
  assert.match(testRoute, /inspected\.identity\.player\.name/);
  assert.match(director, /Notification Sandbox/);
  assert.match(director, /Notification Health/);
  assert.match(director, /PWA Installed/);
  assert.match(director, /Notification Permission/);
  assert.match(director, /Push Subscription/);
  assert.match(director, /Ready To Send/);
  assert.match(director, /notificationSandbox\.templates\.map/);
  assert.match(director, /Notification Log/);
  assert.match(writer, /"Notification Permission"[\s\S]*"Push Subscription"[\s\S]*"Device Last Seen"/);
  assert.match(writer, /"Notification Preview Template"/);
  assert.doesNotMatch(testRoute, /cron|schedule|match finalized|round opened/i);
});

test("Preview sandbox exposes every approved production notification template", () => {
  assert.equal(NOTIFICATION_TITLE, "The Bagger");
  assert.deepEqual(NOTIFICATION_TEMPLATE_OPTIONS.map(({ label }) => label), [
    "Test Notification", "Tee Time Reminder", "Match Ready", "Match Finalized", "Match Reopened",
    "Singles Pairing", "Tournament Timeline Event", "Round Started", "Round Clinched", "Round Tied",
    "Championship Singles LIVE", "Tournament Champions", "Net Skins Round Results", "Tournament Complete",
  ]);
  for (const option of NOTIFICATION_TEMPLATE_OPTIONS) {
    const template = previewNotificationTemplate(option.id);
    assert.equal(template.title, "The Bagger");
    assert.ok(template.body.length > 10);
    assert.match(template.url, /^\//);
  }
});
