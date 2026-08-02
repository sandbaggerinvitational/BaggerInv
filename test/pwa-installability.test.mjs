import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA foundation registers the service worker and supports install guidance", async () => {
  const source = await readFile(
    new URL("../app/PwaFoundation.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /serviceWorker\.register\("\/sw\.js"\)/);
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
  assert.match(manifestSource, /icon-maskable-512\.png/);
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
