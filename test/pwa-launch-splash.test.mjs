import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("custom splash is gated to a cold installed-PWA launch", async () => {
  const [layout, splash, css] = await Promise.all([
    source("app/layout.js"), source("app/PwaLaunchSplash.js"), source("app/pwa-launch-splash.module.css"),
  ]);
  assert.match(layout, /display-mode: standalone/);
  assert.match(layout, /window\.navigator\.standalone===true/);
  assert.match(layout, /window\.sessionStorage\.getItem\(key\)/);
  assert.match(layout, /document\.documentElement\.classList\.add\("pwa-cold-launch"\)/);
  assert.match(layout, /<PwaLaunchSplash \/>/);
  assert.match(css, /:global\(html\.pwa-cold-launch\) \.splash\{display:grid\}/);
  assert.match(splash, /classList\.remove\("pwa-cold-launch"\)/);
});

test("splash consumes active tournament identity and exits when initialization settles", async () => {
  const splash = await source("app/PwaLaunchSplash.js");
  assert.match(splash, /fetch\("\/api\/live", \{ cache: "no-store" \}\)/);
  for (const field of ["name", "edition", "dates", "logo", "year"]) assert.match(splash, new RegExp(`${field}:`));
  assert.match(splash, /formatTournamentEdition/);
  assert.match(splash, /formatTournamentDates/);
  assert.match(splash, /\.finally\(\(\) =>/);
  assert.match(splash, /requestAnimationFrame/);
  assert.match(splash, /onTransitionEnd=\{finish\}/);
  assert.doesNotMatch(splash, /setTimeout|router|usePathname|window\.location/);
});

test("splash animation remains understated and accessible", async () => {
  const [splash, css] = await Promise.all([
    source("app/PwaLaunchSplash.js"), source("app/pwa-launch-splash.module.css"),
  ]);
  assert.match(splash, /Loading Tournament\.\.\./);
  assert.match(splash, /aria-live="polite"/);
  assert.match(css, /transition:opacity \.42s ease/);
  assert.match(css, /transform:scale\(\.975\)/);
  assert.match(css, /height:2px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css, /bounce|spin|rotate/);
});
