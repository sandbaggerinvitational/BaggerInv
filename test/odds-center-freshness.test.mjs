import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { claimOddsCenterLoadingReload, clearOddsCenterLoadingReload } from "../lib/odds-center-loading-recovery.js";
import { reconcileOddsCenterSelection, resolveOddsCenterPhase } from "../lib/odds-center-selection.js";

const snapshots = [
  { phase: "Pre-Tournament" },
  { phase: "After Round 1" },
];

test("Odds Center follows the latest publication until a visitor deliberately selects history", () => {
  assert.equal(resolveOddsCenterPhase(snapshots, "Pre-Tournament", false), "After Round 1");
  assert.equal(resolveOddsCenterPhase(snapshots, "Pre-Tournament", true), "Pre-Tournament");
});

test("Odds Center recovers an empty or retired phase to the latest available publication", () => {
  assert.equal(resolveOddsCenterPhase(snapshots, "", true), "After Round 1");
  assert.equal(resolveOddsCenterPhase(snapshots, "Retired Phase", true), "After Round 1");
  assert.equal(resolveOddsCenterPhase([], "Pre-Tournament", true), "");
});

test("retiring a deliberately selected phase resets to auto-follow across successive refreshes", () => {
  const retired = reconcileOddsCenterSelection([{ phase: "After Round 1" }], "Pre-Tournament", true);
  assert.deepEqual(retired, { phase: "After Round 1", userSelected: false });
  const nextRefresh = reconcileOddsCenterSelection(
    [{ phase: "After Round 1" }, { phase: "After Round 2" }],
    retired.phase,
    retired.userSelected,
  );
  assert.deepEqual(nextRefresh, { phase: "After Round 2", userSelected: false });
});

test("Odds Center refreshes dynamic server data on foreground events without polling or client fetch fallback", async () => {
  const source = await readFile(new URL("../app/odds-center/OddsCenter.js", import.meta.url), "utf8");
  assert.match(source, /useRouter/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /window\.addEventListener\("focus",refresh\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange",visible\)/);
  assert.match(source, /now-lastRefreshAt\.current<2_000/);
  assert.doesNotMatch(source, /setInterval|fetch\(|readOddsSnapshots|loadOddsInputs/);
});

test("Odds Center owns its pre-mount loading recovery without polling or source fallback", async () => {
  const source = await readFile(new URL("../app/odds-center/loading.js", import.meta.url), "utf8");
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /claimOddsCenterLoadingReload\(window\.sessionStorage\)/);
  assert.match(source, /window\.clearTimeout\(refreshTimer\)/);
  assert.match(source, /window\.clearTimeout\(reloadTimer\)/);
  assert.doesNotMatch(source, /setInterval|fetch\(|readOddsSnapshots|loadOddsInputs|google/i);
});

test("a stuck Odds Center claims at most one full reload until content mounts", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  assert.equal(claimOddsCenterLoadingReload(storage), true);
  assert.equal(claimOddsCenterLoadingReload(storage), false);
  clearOddsCenterLoadingReload(storage);
  assert.equal(claimOddsCenterLoadingReload(storage), true);
});
