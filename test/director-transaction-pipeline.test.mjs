import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Director mutations share one serialized client transaction pipeline", async () => {
  const pipeline = await read("lib/director-client-transaction.js");
  assert.match(pipeline, /let queue = Promise\.resolve\(\)/);
  assert.match(pipeline, /queue\.then\(execute, execute\)/);
  assert.match(pipeline, /if \(method === "GET"\) return fetch\(input, init\)/);
  assert.match(pipeline, /x-director-retryable/);
  assert.match(pipeline, /RETRY_DELAYS = \[350, 800, 1600\]/);
  for (const phase of ["verifying", "loadingWorkbook", "reconnecting", "updating", "verifyingChanges", "updated"]) assert.match(pipeline, new RegExp(phase));

  for (const path of [
    "app/admin/CmsManager.js",
    "app/admin/TournamentEditor.js",
    "app/admin/PlayerPassportAdmin.js",
    "app/admin/live-matches/LiveMatchControl.js",
    "app/admin/tournament-guide/GuideEditor.js",
    "app/admin/director/DirectorDashboard.js",
    "app/odds-center/admin/OddsAdmin.js",
  ]) assert.match(await read(path), /directorFetch|runDirectorTransaction/, `${path} must use the shared transaction pipeline`);
});

test("Director transaction status locks controls through completion", async () => {
  const component = await read("app/DirectorTransactionStatus.js");
  const layout = await read("app/layout.js");
  assert.match(component, /Updating Tournament…/);
  assert.match(component, /Please wait…/);
  assert.match(component, /Tournament Updated/);
  assert.match(component, /"Ready"/);
  assert.match(component, /Verifying Director/);
  assert.match(component, /Reconnecting Automatically/);
  assert.match(component, /Verifying Changes/);
  assert.match(component, /Loading Workbook/);
  assert.match(component, /data-state=/);
  assert.match(layout, /<DirectorTransactionStatus/);
});

test("Google batch mutations serialize and retry transient failures", async () => {
  const source = await read("lib/google-sheets-write.js");
  assert.match(source, /let googleMutationQueue = Promise\.resolve\(\)/);
  assert.match(source, /values:batch\(\?:Update\|Clear\)/);
  assert.match(source, /maxRetries: 4/);
  assert.match(source, /delays: \[250, 500, 1000, 2000\]/);
  assert.match(source, /googleMutationQueue\.then\(execute, execute\)/);
});

test("exhausted technical failures are converted to Director-safe messages", async () => {
  const helper = await read("lib/director-transaction-error.js");
  assert.match(helper, /rate\.\?limit/);
  assert.match(helper, /Tournament update could not be verified after automatic recovery/);
  for (const path of [
    "app/api/live-matches/route.js",
    "app/api/admin/cms/route.js",
    "app/api/director/route.js",
    "app/api/director/reset-preview/route.js",
    "app/api/admin/tournament/route.js",
    "app/api/tournament-guide/route.js",
    "app/api/player-passport/admin/route.js",
    "app/api/odds/publish/route.js",
  ]) assert.match(await read(path), /directorTransactionError/, `${path} must sanitize technical mutation failures`);
});
