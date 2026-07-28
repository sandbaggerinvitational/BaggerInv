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
  assert.match(source, /display-mode: standalone/);
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
