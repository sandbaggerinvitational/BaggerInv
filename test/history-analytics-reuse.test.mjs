import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildScorecardAnalytics } from "../lib/scorecard-analytics.js";
import {
  createVersionedHistoricalAnalyticsLoader,
  decodeHistoricalAnalytics,
  encodeHistoricalAnalytics,
  frozenScorecardAnalyticsInput,
  HISTORICAL_ANALYTICS_CODEC_VERSION,
  HISTORICAL_ANALYTICS_VERSION,
  historicalAnalyticsDescriptor,
  historicalAnalyticsInputFingerprint,
  historicalAnalyticsSourceHealth,
  historicalAnalyticsSourceNamespace,
  mutableScorecardAnalyticsInput,
  NEXT_DATA_CACHE_ENTRY_LIMIT_BYTES,
} from "../lib/historical-analytics-reuse.js";

const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const courseHoles = pars.map((par, index) => ({
  Year: 2025,
  "Course ID": "C1",
  Tee: "Black",
  "Hole Number": index + 1,
  Par: par,
  Yardage: 400,
  "Stroke Index": index + 1,
}));
const players = ["P1", "P2"].map((id) => ({
  "Player ID": id,
  "Display Name": `Player ${id}`,
  Slug: `player-${id.toLowerCase()}`,
  Active: true,
}));
const match = {
  "Match ID": "2025-R1-1",
  Year: 2025,
  Round: 1,
  Match: 1,
  Format: "SI",
  "Course ID": "C1",
  Tee: "Black",
  "Team 1 Team ID": "T1",
  "Team 2 Team ID": "T2",
  "Team 1 Player 1": "P1",
  "Team 2 Player 1": "P2",
  "Team 1 Player 1 Stroke": 0,
  "Team 2 Player 1 Stroke": 0,
};
const scoreRow = (playerId, side, delta = 0) => ({
  "Match ID": match["Match ID"],
  Year: 2025,
  Round: 1,
  Match: 1,
  Format: "SI",
  "Course ID": "C1",
  "Player ID": playerId,
  "Team ID": `T${side}`,
  "Score Type": "INDIVIDUAL",
  "Scorecard Status": "COMPLETE",
  ...Object.fromEntries(pars.map((par, index) => [`Hole ${index + 1}`, par + (index === 0 ? delta : 0)])),
});

function fixtureSheets() {
  return {
    roundScorecards: [scoreRow("P1", 1, -1), scoreRow("P2", 2)],
    matches: [match, { ...match, "Match ID": "2026-R1-1", Year: 2026, "Overall Winner": "" }],
    courseHoles,
    courses: [
      { Year: 2025, Round: 1, "Course ID": "C1", Course: "Test Course", Tee: "Black" },
      { Year: 2026, Round: 1, "Course ID": "C2", Course: "Live Course", Tee: "Blue" },
    ],
    teamNames: [
      { Year: 2025, "Team Side": "Team 1", "Team ID": "T1" },
      { Year: 2025, "Team Side": "Team 2", "Team ID": "T2" },
      { Year: 2026, "Team Side": "Team 1", "Team ID": "LIVE" },
    ],
    players,
  };
}

function buildFixtureAnalytics(input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025])) {
  return buildScorecardAnalytics(input);
}

function fakeDurableCache() {
  const entries = new Map();
  let reads = 0;
  let stores = 0;
  return {
    entries,
    counts: () => ({ reads, stores }),
    async readThrough({ descriptor, buildEnvelope, cacheSlot = "primary" }) {
      reads += 1;
      const cacheKey = `${descriptor.key}:${cacheSlot}`;
      if (entries.has(cacheKey)) return entries.get(cacheKey);
      const envelope = await buildEnvelope();
      entries.set(cacheKey, envelope);
      stores += 1;
      return envelope;
    },
  };
}

test("frozen history excludes mutable 2026 while current composition remains observable", () => {
  const sheets = fixtureSheets();
  sheets.roundScorecards.push({
    ...scoreRow("P1", 1),
    "Match ID": "2026-R1-1",
    Year: "",
    "Course ID": "C2",
  });
  sheets.courseHoles.push(
    { ...courseHoles[0], Year: "", "Course ID": "C1" },
    { ...courseHoles[0], Year: "", "Course ID": "C2" }
  );
  const frozen = frozenScorecardAnalyticsInput(sheets, [2025]);
  const mutable = mutableScorecardAnalyticsInput(sheets, [2025]);
  assert.deepEqual([...new Set(frozen.matches.map((row) => row.Year))], [2025]);
  assert.equal(frozen.roundScorecards.some((row) => row["Match ID"] === "2026-R1-1"), false);
  assert.equal(frozen.courseHoles.some((row) => row["Course ID"] === "C1" && row.Year === ""), true);
  assert.equal(frozen.courseHoles.some((row) => row["Course ID"] === "C2"), false);
  assert.deepEqual([...new Set(mutable.matches.map((row) => row.Year))], [2026]);
  assert.equal(frozen.players[0].Active, undefined);

  const before = historicalAnalyticsInputFingerprint(frozen);
  sheets.matches[1]["Overall Winner"] = "Team 1";
  assert.equal(historicalAnalyticsInputFingerprint(frozenScorecardAnalyticsInput(sheets, [2025])), before);
  assert.equal(mutableScorecardAnalyticsInput(sheets, [2025]).matches[0]["Overall Winner"], "Team 1");
  assert.notEqual(
    historicalAnalyticsInputFingerprint(frozenScorecardAnalyticsInput(sheets, [2025, 2026])),
    before
  );
});

test("version key changes only at explicit source, analytics, completion, or environment boundaries", () => {
  const input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025]);
  const preview = historicalAnalyticsSourceNamespace({
    env: { VERCEL_ENV: "preview" },
    sourceIdentities: ["preview-sheet", "archive-sheet"],
  });
  const base = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: preview });
  const sameAfterFiveMinutes = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: preview });
  assert.equal(sameAfterFiveMinutes.key, base.key);

  const corrected = structuredClone(input);
  corrected.roundScorecards[0]["Hole 1"] = 2;
  assert.notEqual(historicalAnalyticsDescriptor({ input: corrected, completedYears: [2025], sourceNamespace: preview }).key, base.key);
  assert.notEqual(historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: preview, analyticsVersion: "next" }).key, base.key);
  assert.notEqual(historicalAnalyticsDescriptor({ input, completedYears: [2025, 2026], sourceNamespace: preview }).key, base.key);
  assert.notEqual(historicalAnalyticsDescriptor({
    input,
    completedYears: [2025],
    sourceNamespace: historicalAnalyticsSourceNamespace({
      env: { VERCEL_ENV: "production" },
      sourceIdentities: ["preview-sheet", "archive-sheet"],
    }),
  }).key, base.key);
});

test("compressed envelope restores selectors, Set semantics, references, precision, and stays below Next limit", () => {
  const input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025]);
  const descriptor = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: "test:source" });
  const original = {
    ...buildFixtureAnalytics(input),
    ghostMatchExclusions: new Set(["2025-R1-1:P2"]),
    floatingPointProbe: 1 / 3,
    missingProbe: undefined,
  };
  const envelope = encodeHistoricalAnalytics(original, descriptor);
  const restored = decodeHistoricalAnalytics(JSON.parse(JSON.stringify(envelope)), descriptor);

  assert.ok(envelope.cacheBytes < NEXT_DATA_CACHE_ENTRY_LIMIT_BYTES);
  assert.equal(restored.floatingPointProbe, original.floatingPointProbe);
  assert.equal(restored.missingProbe, undefined);
  assert.ok(restored.ghostMatchExclusions instanceof Set);
  assert.equal(restored.ghostMatchExclusions.has("2025-R1-1:P2"), true);
  assert.equal(restored.scorecards[0], restored.usableScorecards[0]);
  assert.deepEqual(restored.playerSummary("P1"), original.playerSummary("P1"));
  assert.deepEqual(restored.teamSummary("T1"), original.teamSummary("T1"));
  assert.deepEqual(restored.courseSummary("C1"), original.courseSummary("C1"));
  assert.throws(() => restored.ghostMatchExclusions.add("bad"), /read-only/);
  assert.throws(() => restored.scorecards.push({}), TypeError);
});

test("same-version requests hit once, return isolated immutable products, and cross-consumer order is irrelevant", async () => {
  const cache = fakeDurableCache();
  const load = createVersionedHistoricalAnalyticsLoader({ readThrough: cache.readThrough });
  const input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025]);
  const descriptor = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: "test:source" });
  let builds = 0;
  const request = () => load({ descriptor, build: () => {
    builds += 1;
    return buildFixtureAnalytics(input);
  } });

  const player = await request();
  const tournament = await request();
  const round = await request();
  const records = await request();
  assert.equal(builds, 1);
  assert.deepEqual(cache.counts(), { reads: 4, stores: 1 });
  assert.notEqual(player, tournament);
  assert.notEqual(player.scorecards, tournament.scorecards);
  assert.deepEqual(
    [player, tournament, round, records].map((analytics) => analytics.report),
    Array(4).fill(player.report)
  );
});

test("bounded concurrent cache miss is single-flight and failed builds can retry", async () => {
  const cache = fakeDurableCache();
  const load = createVersionedHistoricalAnalyticsLoader({ readThrough: cache.readThrough });
  const input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025]);
  const descriptor = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: "test:concurrent" });
  let builds = 0;
  const requests = Array.from({ length: 8 }, () => load({
    descriptor,
    build: async () => {
      builds += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return buildFixtureAnalytics(input);
    },
  }));
  const results = await Promise.all(requests);
  assert.equal(builds, 1);
  assert.equal(cache.counts().reads, 1);
  assert.equal(results.length, 8);
  assert.equal(new Set(results.map((result) => result)).size, 8);

  const failingCache = fakeDurableCache();
  const retryingLoad = createVersionedHistoricalAnalyticsLoader({ readThrough: failingCache.readThrough });
  let attempts = 0;
  await assert.rejects(() => retryingLoad({ descriptor, build: () => {
    attempts += 1;
    throw new Error("build failed");
  } }), /build failed/);
  const recovered = await retryingLoad({ descriptor, build: () => {
    attempts += 1;
    return buildFixtureAnalytics(input);
  } });
  assert.equal(attempts, 2);
  assert.equal(failingCache.entries.size, 1);
  assert.equal(recovered.report.scorecardRowsLoaded, 2);
});

test("partial source bypasses durable storage and a healthy retry becomes reusable", async () => {
  const cache = fakeDurableCache();
  const load = createVersionedHistoricalAnalyticsLoader({ readThrough: cache.readThrough });
  const input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025]);
  const descriptor = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: "test:health" });
  let builds = 0;
  await load({ descriptor, sourceReusable: false, build: () => {
    builds += 1;
    return buildFixtureAnalytics(input);
  } });
  assert.deepEqual(cache.counts(), { reads: 0, stores: 0 });
  await load({ descriptor, sourceReusable: true, build: () => {
    builds += 1;
    return buildFixtureAnalytics(input);
  } });
  await load({ descriptor, sourceReusable: true, build: () => {
    builds += 1;
    return buildFixtureAnalytics(input);
  } });
  assert.equal(builds, 2);
  assert.deepEqual(cache.counts(), { reads: 2, stores: 1 });

  const unavailable = {};
  Object.defineProperty(unavailable, "__scorecardSourceHealth", {
    value: { complete: false, failedSheets: ["Round Scorecards"], historicalMode: "canonical" },
  });
  assert.deepEqual(historicalAnalyticsSourceHealth(unavailable), {
    reusable: false,
    sourceMode: "canonical",
    failedSheets: ["Round Scorecards"],
  });
});

test("corrupt entries fail closed at decode and the loader repairs into a reusable slot", async () => {
  const input = frozenScorecardAnalyticsInput(fixtureSheets(), [2025]);
  const descriptor = historicalAnalyticsDescriptor({ input, completedYears: [2025], sourceNamespace: "test:corrupt" });
  const envelope = encodeHistoricalAnalytics(buildFixtureAnalytics(input), descriptor);
  const corrupt = { ...envelope, payload: `${envelope.payload}x` };
  assert.throws(() => decodeHistoricalAnalytics(corrupt, descriptor), /checksum/);
  assert.throws(() => decodeHistoricalAnalytics(envelope, { ...descriptor, analyticsVersion: "incompatible" }), /analyticsVersion/);

  const cache = fakeDurableCache();
  cache.entries.set(`${descriptor.key}:primary`, corrupt);
  const load = createVersionedHistoricalAnalyticsLoader({ readThrough: cache.readThrough });
  let builds = 0;
  const request = () => load({ descriptor, build: () => {
    builds += 1;
    return buildFixtureAnalytics(input);
  } });
  const repaired = await request();
  const reused = await request();
  assert.equal(builds, 1);
  assert.equal(repaired.report.scorecardRowsLoaded, 2);
  assert.deepEqual(reused.report, repaired.report);
  assert.equal(cache.entries.has(`${descriptor.key}:repair-v1`), true);
});

test("codec identity is bound to restoration code and the Node/V8 runtime majors", async () => {
  const source = await readFile(new URL("../lib/historical-analytics-reuse.js", import.meta.url), "utf8");
  const normalized = source.replace(
    /const HISTORICAL_ANALYTICS_CODEC_IMPLEMENTATION = "[a-f0-9]+";/,
    'const HISTORICAL_ANALYTICS_CODEC_IMPLEMENTATION = "<implementation-digest>";'
  );
  const implementationDigest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  assert.match(HISTORICAL_ANALYTICS_CODEC_VERSION, new RegExp(`node${process.versions.node.split(".")[0]}`));
  assert.match(HISTORICAL_ANALYTICS_CODEC_VERSION, new RegExp(`v8-${process.versions.v8.split(".")[0]}`));
  assert.ok(HISTORICAL_ANALYTICS_CODEC_VERSION.endsWith(implementationDigest));
});

test("analytics implementation digest requires an explicit version update", async () => {
  const files = [
    "lib/scorecard-analytics.js",
    "lib/scorecard-net.js",
    "lib/prediction-engine.js",
    "lib/legacy-history-player-identity.js",
  ];
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(await readFile(new URL(`../${file}`, import.meta.url)));
  }
  assert.equal(HISTORICAL_ANALYTICS_VERSION, `scorecard-domain-v1-${hash.digest("hex").slice(0, 16)}`);
});

test("runtime wiring removes timer validity and preserves distinct Records/Career contexts", async () => {
  const [service, sheets, playerPage, recordPage, serviceWorker] = await Promise.all([
    readFile(new URL("../lib/scorecard-data.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-data.js", import.meta.url), "utf8"),
    readFile(new URL("../app/players/[slug]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/records/[slug]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(service, /unstable_cache/);
  assert.match(service, /revalidate:\s*false/);
  assert.match(service, /frozenScorecardAnalyticsInput/);
  assert.doesNotMatch(service, /ANALYTICS_CACHE_MS|5 \* 60 \* 1000/);
  assert.doesNotMatch(service, /GOOGLE_SHEETS_CACHE_TAG/);
  assert.match(sheets, /scorecardSheetIsStructurallyComplete/);
  assert.match(sheets, /rows\.length > 0/);
  assert.match(sheets, /Scorecard analytics sheet failed structural validation/);
  assert.equal([...playerPage.matchAll(/getRecords\(\)/g)].length, 2);
  assert.doesNotMatch(playerPage, /getPlayerStats\(player\["Player ID"\]\)/);
  assert.match(recordPage, /getLeaderboardDefinition\(slug\)/);
  assert.ok(recordPage.indexOf("getLeaderboardDefinition(slug)") < recordPage.indexOf("getRecords()"));
  assert.match(serviceWorker, /pathname\.startsWith\("\/_next\/"\)/);
});
