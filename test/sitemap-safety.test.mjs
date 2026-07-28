import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Preview sitemap never requests Google Sheets data", async () => {
  const source = await readFile(new URL("../app/sitemap.js", import.meta.url), "utf8");
  const previewGuard = source.indexOf('process.env.VERCEL_ENV === "preview"');
  const refresh = source.indexOf("await refreshHistoricalData()");

  assert.ok(previewGuard > -1, "sitemap must detect Vercel Preview");
  assert.ok(refresh > previewGuard, "Preview must return before the Sheets refresh");
  assert.match(source, /return staticEntries\(\)/);
  assert.doesNotMatch(source, /^import .*lib\/(stats|draft|leaderboards)/m);
  assert.ok(source.indexOf('import("../lib/stats")') > previewGuard);
});

test("production sitemap has a static public fallback", async () => {
  const source = await readFile(new URL("../app/sitemap.js", import.meta.url), "utf8");
  assert.match(source, /catch \(error\)/);
  assert.match(source, /serving public static routes only/);
  assert.doesNotMatch(source, /\/admin|\/score|\/activate|\/api/);
});
