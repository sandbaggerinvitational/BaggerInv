import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notificationReady, parsePushSubscription, previewPushConfiguration } from "../lib/web-push-notifications.js";
import { tournamentReadiness } from "../lib/tournament-readiness.js";
import { NOTIFICATION_TEMPLATE_OPTIONS, NOTIFICATION_TITLE, notificationTemplateOptions, previewNotificationTemplate } from "../lib/notification-templates.js";

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
  assert.match(worker, /payload\.title \|\| "Tournament Update"/);
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

test("Preview sandbox exposes event titles while iOS supplies The Bagger attribution once", () => {
  assert.equal(NOTIFICATION_TITLE, "Tournament Update");
  assert.deepEqual(NOTIFICATION_TEMPLATE_OPTIONS.map(({ label }) => label), [
    "🏌️ Test Notification", "⛳ Tee Time Reminder", "⛳ Your Match Is Ready", "✅ Match Finalized", "🔄 Match Reopened",
    "👤 Singles Pairing Released", "🍽️ Championship Dinner", "🔴 Round 3 Is LIVE", "🏆 Round 3 Clinched", "🤝 Round 3 Ends in a Tie",
    "🏆 Championship Singles LIVE", "🏆 Champions Crowned", "💰 Round 3 Net Skins Final", "🏁 Tournament Complete",
  ]);
  for (const option of NOTIFICATION_TEMPLATE_OPTIONS) {
    const template = previewNotificationTemplate(option.id);
    assert.notEqual(template.title, "The Bagger");
    assert.equal(template.title, option.label);
    assert.ok(template.body.length > 10);
    assert.match(template.url, /^\//);
  }
});

test("approved Version 1.0 notification copy and deep links remain exact", () => {
  const expected = {
    "tee-time-reminder": ["⛳ Tee Time Reminder", "Round 3 • Singles\n10:50 AM • Gold Tees\nThe Ocean Course", "/my-match"],
    "match-ready": ["⛳ Your Match Is Ready", "Round 3 • Singles\nvs Patrick Noonan\nTap to begin scoring.", "/my-match"],
    "singles-pairing": ["👤 Singles Pairing Released", "Round 3 • Singles\nvs Patrick Noonan\n10:50 AM • Gold Tees\nThe Ocean Course", "/my-match"],
    "match-finalized": ["✅ Match Finalized", "Round 3 • Singles\nFinalized by Patrick Noonan.\nTap to view the official scorecard.", "/game-center/2026-R3-5?from=my-match#scorecard"],
    "match-reopened": ["🔄 Match Reopened", "Round 3 • Singles\nReopened by Clay Beltran.\nTap to resume scoring.", "/my-match"],
    "timeline-event": ["🍽️ Championship Dinner", "Begins in 30 minutes\nThe Ocean Room", "/home"],
    "round-started": ["🔴 Round 3 Is LIVE", "Every match is underway.\nTap to follow the action live.", "/live"],
    "round-clinched": ["🏆 Round 3 Clinched", "The Pickles won Round 3 • Singles\n22.5–13.5.\nTap to view updated standings.", "/live"],
    "round-tied": ["🤝 Round 3 Ends in a Tie", "The Pickles and Lipp It and Rip It\nfinished tied.\nTap to view updated standings.", "/live"],
    "championship-singles-live": ["🏆 Championship Singles LIVE", "Championship Saturday has arrived.\nEvery point matters.\nTap to follow the action live.", "/live"],
    "tournament-champions": ["🏆 Champions Crowned", "Congratulations to\nThe Pickles,\n2026 Sandbagger Invitational Champions!", "/live"],
    "tournament-complete": ["🏁 Tournament Complete", "Another Sandbagger Invitational\nis in the books.\nTap to view the final results.", "/live"],
    "net-skins-results": ["💰 Round 3 Net Skins Final", "You won 3 skins • $300\nTap to view standings and payouts.", "/live?view=leaderboards&tab=net-skins"],
  };
  for (const [id, values] of Object.entries(expected)) {
    const template = previewNotificationTemplate(id);
    assert.deepEqual([template.title, template.body, template.url], values, id);
    assert.doesNotMatch(template.body, /^[^\n]*[⛳✅🔄👤🍽️🔴🏆🤝💰🏁]/u, `${id} body repeats an emoji`);
  }
  assert.equal(previewNotificationTemplate("net-skins-results", { skins: 0 }).body, "Round 3 Net Skins are official.\nTap to view standings and payouts.");
  assert.doesNotMatch(previewNotificationTemplate("net-skins-results", { skins: 0 }).body, /0 skins|won zero/i);
  assert.equal(previewNotificationTemplate("net-skins-results", { skins: 1, winnings: "$150" }).body, "You won 1 skin • $150\nTap to view standings and payouts.");
});

test("sandbox button labels are the exact titles generated for its current golfer context", () => {
  const context = { round: 2, format: "Scramble", event: "Awards Ceremony", eventIcon: "🏆" };
  for (const option of notificationTemplateOptions(context)) {
    assert.equal(option.label, previewNotificationTemplate(option.id, context).title);
  }
});
