import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA foundation registers the service worker and supports install guidance", async () => {
  const source = await readFile(
    new URL("../app/PwaFoundation.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /serviceWorker\.register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(source, /registration\.update\(\)/);
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /Add to Home Screen/);
  assert.match(source, /Tap Share/);
  assert.match(source, /Tap Add/);
  assert.doesNotMatch(source, /prompt\.prompt\(/);
  assert.match(source, /display-mode: standalone/);
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /newer version of SBI is ready/);
});

test("service worker never intercepts writes or private scoring routes", async () => {
  const source = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /request\.method !== "GET"/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/score"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/admin"\)/);
  assert.match(source, /fetch\(request\)\.catch/);
  assert.match(source, /const CACHE_VERSION = "sbi-shell-v3"/);
  assert.match(source, /if \(url\.pathname\.startsWith\("\/_next\/"\)\) return/);
  assert.doesNotMatch(source, /url\.pathname\.startsWith\("\/_next\/static\/"\) \|\|/);
  const navigationBranch = source.match(
    /if \(request\.mode === "navigate"\) \{([\s\S]*?)\n  \}/
  )?.[1] || "";
  assert.match(navigationBranch, /fetch\(request\)\.catch/);
  assert.doesNotMatch(navigationBranch, /caches\.match\(request\)|cache\.put/);
  assert.doesNotMatch(source, /headers\.get\(["']RSC["']\)[\s\S]*respondWith/);
});

test("offline page does not imply that scores can be saved offline", async () => {
  const source = await readFile(
    new URL("../public/offline.html", import.meta.url),
    "utf8",
  );
  assert.match(source, /never reports a score as saved without a confirmed server response/i);
});

test("iPhone release metadata uses safe-area viewport, launch images, and a maskable icon", async () => {
  const [layout, manifestSource] = await Promise.all([
    readFile(new URL("../app/layout.js", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /statusBarStyle: "black-translucent"/);
  assert.match(layout, /title: "The Bagger"/);
  assert.match(layout, /applicationName: "The Bagger"/);
  assert.match(layout, /url: "\/apple-touch-icon\.png"/);
  assert.match(layout, /startupImage/);
  assert.match(layout, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  assert.match(layout, /<meta name="apple-mobile-web-app-title" content="The Bagger" \/>/);
  assert.match(layout, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" \/>/);
  assert.match(layout, /rel="apple-touch-startup-image" href=\{url\} media=\{media\}/);
  for (const dimensions of [
    "640x1136", "750x1334", "1242x2208", "1125x2436", "1170x2532", "1179x2556",
    "1206x2622", "828x1792", "1242x2688", "1284x2778", "1290x2796", "1320x2868",
  ]) {
    assert.match(layout, new RegExp(`iphone-${dimensions}\\.png`));
    const image = await readFile(new URL(`../public/splash/iphone-${dimensions}.png`, import.meta.url));
    assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
  assert.match(manifestSource, /icon-maskable-512\.png/);
  assert.match(manifestSource, /background_color: "#092f25"/);
  assert.match(manifestSource, /theme_color: "#0b3529"/);
  assert.match(manifestSource, /name: "The Bagger"/);
  assert.match(manifestSource, /short_name: "The Bagger"/);
  assert.doesNotMatch(manifestSource, /absoluteUrl\("\/icon/);
  assert.match(manifestSource, /shortcuts/);
  assert.match(manifestSource, /\/my-match\?source=shortcut/);
});

test("mobile Home exposes an unambiguous iOS Home Screen title", async () => {
  const source = await readFile(
    new URL("../app/home/page.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /title:\s*\{ absolute: "The Bagger" \}/);
  assert.match(source, /applicationName: "The Bagger"/);
  assert.doesNotMatch(source, /Home \| Sandbagger Invitational/);
});

test("participant profile exposes the native Web Share API with a copy fallback", async () => {
  const source = await readFile(
    new URL("../app/me/ParticipantProfile.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /navigator\.share/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /Share SBI/);
});
