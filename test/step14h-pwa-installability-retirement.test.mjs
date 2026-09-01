import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { browserInstallabilityEnabled } from "../lib/browser-installability-policy.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Production retires browser installability while Preview retains its explicit test policy", async () => {
  assert.equal(browserInstallabilityEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(browserInstallabilityEnabled({ VERCEL_ENV: " PRODUCTION " }), false);
  assert.equal(browserInstallabilityEnabled({ VERCEL_ENV: "preview" }), true);
  assert.equal(browserInstallabilityEnabled({ VERCEL_ENV: "development" }), true);
  assert.equal(browserInstallabilityEnabled({}), true);

  const layout = await source("app/layout.js");
  assert.match(layout, /const installabilityEnabled = browserInstallabilityEnabled\(\)/);
  assert.match(layout, /\.\.\.\(installabilityEnabled \? \{ manifest: "\/manifest\.webmanifest" \} : \{\}\)/);
  assert.match(layout, /data-browser-installability=\{installabilityEnabled \? "enabled" : "retired"\}/);
  assert.match(layout, /<PwaFoundation installabilityEnabled=\{installabilityEnabled\} \/>/);
  assert.match(layout, /url: "\/favicon\.ico"/);
  assert.match(layout, /url: "\/apple-touch-icon\.png"/);
  assert.match(layout, /\.\.\.homeMetadata/);
});

test("Production policy suppresses install promotion without removing participant web behavior", async () => {
  const [foundation, setupBanner, participantBoundary] = await Promise.all([
    source("app/PwaFoundation.js"),
    source("app/PlayerSetupBanner.js"),
    source("lib/participant-shell.js"),
  ]);

  assert.match(foundation, /export default function PwaFoundation\(\{ installabilityEnabled = false \}\)/);
  assert.match(foundation, /if \(installabilityEnabled\) \{[\s\S]*addEventListener\("beforeinstallprompt"/);
  assert.match(foundation, /if \(!installabilityEnabled \|\| !showGlobalInstall/);
  assert.match(foundation, /if \(!participantPresentation\) return null/);
  assert.match(setupBanner, /dataset\.browserInstallability !== "retired"/);
  assert.match(setupBanner, /if \(!readiness\.pwaInstalled && !installabilityEnabled\) return null/);
  for (const route of ["/home", "/my-match", "/score", "/me", "/app/"]) {
    assert.match(participantBoundary, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("service-worker caching, push support, and safe existing-install launch support are retained", async () => {
  const [foundation, worker, layout, splash] = await Promise.all([
    source("app/PwaFoundation.js"),
    source("public/sw.js"),
    source("app/layout.js"),
    source("app/PwaLaunchSplash.js"),
  ]);

  assert.match(foundation, /serviceWorker\.register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(foundation, /registration\.update\(\)/);
  assert.doesNotMatch(foundation, /serviceWorker\.getRegistrations|\.unregister\(\)/);
  assert.match(worker, /CACHE_VERSION = "sbi-shell-v5"/);
  assert.match(worker, /caches\.match\("\/offline\.html"\)/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(layout, /display-mode: standalone/);
  assert.match(layout, /<PwaLaunchSplash \/>/);
  assert.match(splash, /participantAppShellRoute\(pathname\)/);
});

test("the legacy manifest remains well formed for Preview and existing-install compatibility", async () => {
  const [manifest, route] = await Promise.all([
    source("lib/web-app-manifest.js"),
    source("app/manifest.webmanifest/route.js"),
  ]);
  assert.match(manifest, /name: "The Bagger"/);
  assert.match(manifest, /short_name: "The Bagger"/);
  assert.match(manifest, /start_url: "\/home"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(route, /content-type": "application\/manifest\+json/);
  assert.match(route, /webAppManifest\(\)/);
});
