import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("round navigation updates local state and URL without a Next server navigation", async () => {
  const source = await read("app/live/LeaderboardsDashboard.js");
  assert.match(source, /setSelection\(selectionFrom\(params\)\)/);
  assert.match(source, /window\.history\.pushState/);
  assert.doesNotMatch(source, /router\.(push|replace)/);
  assert.doesNotMatch(source, /useRouter/);
});

test("round navigation reuses the loaded model without API or Google reads", async () => {
  const source = await read("app/live/LeaderboardsDashboard.js");
  const update = source.slice(source.indexOf("const updateQuery"), source.indexOf("const refresh ="));
  assert.doesNotMatch(update, /fetch\(|refresh\(/);
  assert.match(update, /apiRequests: 0/);
  assert.match(update, /googleSheetsRequests: 0/);
  assert.match(update, /cache: "in-memory hit"/);
  assert.match(update, /normalizationMs: 0/);
});

test("Preview records tap-to-render after the selected view paints", async () => {
  const source = await read("app/live/LeaderboardsDashboard.js");
  assert.match(source, /navigationStartedAt\.current/);
  assert.match(source, /window\.requestAnimationFrame/);
  assert.match(source, /tapToRenderMs/);
  assert.match(source, /Leaderboard navigation performance/);
});

test("browser history and deep-linked query parameters remain authoritative", async () => {
  const source = await read("app/live/LeaderboardsDashboard.js");
  assert.match(source, /useSearchParams\(\)/);
  assert.match(source, /useEffect\(\(\) => setSelection\(selectionFrom\(searchParams\)\)/);
  assert.match(source, /params\.set\("view", "leaderboards"\)/);
});
