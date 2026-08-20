import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("live scoring separates a clinched result from an 18-hole scorecard", async () => {
  const writes = await source("lib/google-sheets-write.js");
  assert.doesNotMatch(writes, /priorStatus\.complete && !existing\.length/);
  assert.doesNotMatch(writes, /This match is already complete\. An administrator must reopen it before adding another hole\./);
  assert.match(writes, /matchComplete: isScorecardComplete\(persistedScores\)/);
  assert.match(writes, /const matchComplete = isScorecardComplete\(allScores\)/);
  assert.match(writes, /canConfirm: match\["Match Status"\] !== "Final" && isScorecardComplete\(holeResults\)/);
});

test("only Final status locks hole writes and finalization requires all 18 holes", async () => {
  const writes = await source("lib/google-sheets-write.js");
  assert.match(writes, /if \(match\["Match Status"\] === "Final"\) throw new Error\("Reopen the match before changing hole scores\."\)/);
  assert.match(writes, /if \(!isScorecardComplete\(holeResults\)\)/);
  assert.match(writes, /Record all 18 holes before submitting the scorecard\./);
});

test("generic updates cannot bypass dedicated lifecycle transactions", async () => {
  const writes = await source("lib/google-sheets-write.js");
  const cms = await source("lib/admin-cms-config.js");
  const route = await source("app/api/live-matches/route.js");
  assert.match(writes, /assertGenericMatchUpdateHasNoLifecycle\(updates\)/);
  assert.match(writes, /export async function markLiveMatch/);
  assert.match(writes, /Official match archives cannot be deleted from generic content management/);
  assert.match(writes, /Official match archives are created only by Finalize Match/);
  assert.match(cms, /field\("Match Status", "Status", "readonly"\)/);
  assert.match(route, /action === "mark-live"[\s\S]*markLiveMatch/);
});
