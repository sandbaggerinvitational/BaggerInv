import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { initializeTournamentWorkbook } from "../lib/tournament-workbook-initialization.js";
import { createRuntimeProfile, runtimePerformanceReport } from "../lib/runtime-performance.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("healthy optional tournament modules load in one batch", async () => {
  let requiredBatches = 0;
  let optionalBatches = 0;
  let isolatedReads = 0;
  const result = await initializeTournamentWorkbook({
    requiredNames: ["Live Matches"],
    optionalNames: ["Dining", "Local Guide", "Important Contacts"],
    readRequired: async () => {
      requiredBatches += 1;
      return { "Live Matches": [["Match ID"], ["M1"]] };
    },
    readOptionalBatch: async (names) => {
      optionalBatches += 1;
      return Object.fromEntries(names.map((name) => [name, [["Year"], [2026]]]));
    },
    readSheet: async () => {
      isolatedReads += 1;
      return [];
    },
  });
  assert.equal(requiredBatches, 1);
  assert.equal(optionalBatches, 1);
  assert.equal(isolatedReads, 0);
  assert.equal(result.checks.optional.Dining, "ready");
});

test("optional batch failure remains fail-safe and isolates missing modules", async () => {
  let isolatedReads = 0;
  const result = await initializeTournamentWorkbook({
    requiredNames: ["Live Matches"],
    optionalNames: ["Dining", "Missing Module"],
    readRequired: async () => ({ "Live Matches": [["Match ID"], ["M1"]] }),
    readOptionalBatch: async () => { throw new Error("invalid optional range"); },
    readSheet: async (name) => {
      isolatedReads += 1;
      if (name === "Missing Module") throw new Error("missing");
      return [["Year"], [2026]];
    },
  });
  assert.equal(isolatedReads, 2);
  assert.equal(result.checks.optional.Dining, "ready");
  assert.equal(result.checks.optional["Missing Module"], "missing");
});

test("runtime profiles rank server operations without changing response payloads", async () => {
  const profile = createRuntimeProfile("test operation");
  const value = await profile.measure("assembly", async () => "unchanged");
  profile.finish({ cache: "hit" });
  assert.equal(value, "unchanged");
  assert.equal(runtimePerformanceReport().find((item) => item.operation === "test operation")?.samples, 1);
});

test("normalized reads classify static, semi-static, and live sheets and cache by sheet", async () => {
  const [reader, model, liveRoute, diagnostic] = await Promise.all([
    source("lib/google-sheets-server-read.js"),
    source("app/live/sheetData.js"),
    source("app/api/live/route.js"),
    source("app/api/preview-reliability/route.js"),
  ]);
  assert.match(reader, /LIVE_SHEETS/);
  assert.match(reader, /SEMI_STATIC_SHEETS/);
  assert.match(reader, /sheetValueCache/);
  assert.match(reader, /sheetCacheHitRate/);
  assert.match(model, /TOURNAMENT_MODEL_TTL_MS = 2_500/);
  assert.match(model, /readOptionalBatch: readNormalizedSheetsValues/);
  assert.match(model, /invalidateNormalizedSheetCache\(\)/);
  assert.match(liveRoute, /Server-Timing|attachRuntimeTiming/);
  assert.match(diagnostic, /slowestOperations: runtimePerformanceReport\(\)/);
});

test("personalized match assembly reuses the initialized tournament model", async () => {
  const [initialization, matches, workbook] = await Promise.all([
    source("lib/participant-initialization.js"),
    source("app/api/player-passport/matches/route.js"),
    source("lib/google-sheets-write.js"),
  ]);
  assert.match(initialization, /tournamentData,/);
  assert.match(matches, /const tournamentData = initialized\.tournamentData/);
  assert.match(workbook, /: \["Trusted Devices", "Player Passport", "Players", "Tournaments", "Handicaps"/);
  assert.match(workbook, /validatePlayerPassport\(session, sheets\)/);
  assert.match(workbook, /passportTournamentContext\(sheets\)/);
});

test("published projections use a semi-static cache refreshed by publish and reset", async () => {
  const workbook = await source("lib/google-sheets-write.js");
  assert.match(workbook, /ODDS_SNAPSHOT_CACHE_TTL_MS = 60_000/);
  assert.match(workbook, /pendingOddsSnapshotRead/);
  assert.match(workbook, /oddsSnapshotCache = all/);
  assert.match(workbook, /invalidateOddsSnapshotCache\(\);\s*return saved/);
  assert.match(workbook, /method !== "GET"[\s\S]*invalidateNormalizedSheetCache\(\)/);
});
