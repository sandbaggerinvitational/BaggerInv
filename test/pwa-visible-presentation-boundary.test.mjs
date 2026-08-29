import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("global visible PWA presentation is scoped by the explicit participant route boundary", async () => {
  const [layout, foundation, splash, error] = await Promise.all([
    source("app/layout.js"),
    source("app/PwaFoundation.js"),
    source("app/PwaLaunchSplash.js"),
    source("app/error.js"),
  ]);

  assert.match(layout, /var launchRoute=window\.location\.pathname==="\/home"/);
  assert.doesNotMatch(layout, /window\.location\.pathname==="\/"\|\|/);

  for (const component of [foundation, splash, error]) {
    assert.match(component, /participantAppShellRoute\(pathname\)/);
  }
  assert.match(foundation, /if \(!participantPresentation\) return null/);
  assert.match(foundation, /serviceWorker\.register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(splash, /if \(!participantPresentation\)/);
  assert.match(error, /if \(participantPresentation\) return/);
});

test("public routes cannot receive install, offline, update, splash, or participant error presentation", async () => {
  const [foundation, splash, error] = await Promise.all([
    source("app/PwaFoundation.js"),
    source("app/PwaLaunchSplash.js"),
    source("app/error.js"),
  ]);

  const foundationGate = foundation.indexOf("if (!participantPresentation) return null");
  assert.ok(foundationGate >= 0);
  for (const visiblePresentation of ["if (!online)", "if (updateReady)", "if (!showGlobalInstall"]) {
    assert.ok(foundationGate < foundation.indexOf(visiblePresentation), visiblePresentation);
  }
  assert.match(splash, /classList\.remove\("pwa-cold-launch", "pwa-home-entering"\)/);
  assert.match(error, /Unable to load tournament data\./);
  assert.match(error, /participantPresentation[\s\S]*We couldn’t open this page\.[\s\S]*Unable to load tournament data\./);
});
