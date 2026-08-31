import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL("../contracts/mobile/v1/participant-content-fixtures.json", import.meta.url);

async function fixtures() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

const expectedProducts = new Map([
  ["passport", {
    endpoint: "GET /api/mobile/v1/passport",
    schema: "passport.schema.json",
    covers: ["veteran", "new-player", "no-records", "no-captain", "long-history"],
  }],
  ["guide", {
    endpoint: "GET /api/mobile/v1/guide",
    schema: "guide.schema.json",
    covers: ["populated", "withdrawn", "long-rules", "multiple-courses", "missing-optional-actions"],
  }],
  ["history", {
    endpoint: "GET /api/mobile/v1/history",
    schema: "history.schema.json",
    covers: ["current", "completed", "many-years"],
  }],
  ["historyDetail", {
    endpoint: "GET /api/mobile/v1/history/{year}",
    schema: "history-detail.schema.json",
    covers: ["bounded-detail", "no-scorecard"],
  }],
  ["records", {
    endpoint: "GET /api/mobile/v1/records",
    schema: "records.schema.json",
    covers: ["single-holder", "tied-holders", "multiple-categories", "empty", "long-content"],
  }],
  ["odds", {
    endpoint: "GET /api/mobile/v1/odds",
    schema: "odds.schema.json",
    covers: ["published", "unpublished", "long-names", "tied-ranks", "edge-values"],
  }],
]);

function scenario(product, id) {
  const result = product.scenarios.find((candidate) => candidate.scenarioId === id);
  assert.ok(result, `Missing scenario ${id}`);
  return result;
}

function walk(value, visit, path = []) {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, [...path, index]));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => walk(item, visit, [...path, key]));
  }
}

function fragmentIds(value, result = []) {
  if (Array.isArray(value)) value.forEach((item) => fragmentIds(item, result));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/Id$/.test(key) && typeof item === "string") result.push(item);
      if (/Ids$/.test(key) && Array.isArray(item)) result.push(...item.filter((entry) => typeof entry === "string"));
      fragmentIds(item, result);
    }
  }
  return result;
}

test("participant-content fixture inventory is explicitly synthetic and complete for all six contracts", async () => {
  const inventory = await fixtures();
  assert.equal(inventory.fixtureVersion, 1);
  assert.equal(inventory.synthetic, true);
  assert.equal(inventory.contractFamily, "mobile-v1-participant-content");
  assert.deepEqual(inventory.products.map((product) => product.productId), [...expectedProducts.keys()]);
  assert.equal(inventory.products.length, 6);

  for (const product of inventory.products) {
    const expected = expectedProducts.get(product.productId);
    assert.ok(expected);
    assert.equal(product.endpoint, expected.endpoint);
    assert.equal(product.schema, expected.schema);
    assert.ok(Array.isArray(product.scenarios) && product.scenarios.length > 0);
    const coverage = new Set(product.scenarios.flatMap((item) => item.covers));
    for (const requirement of expected.covers) assert.ok(coverage.has(requirement), `${product.productId} lacks ${requirement}`);
    for (const item of product.scenarios) {
      assert.match(item.scenarioId, new RegExp(`^${product.productId.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-`));
      assert.ok(Array.isArray(item.covers) && item.covers.length > 0);
      assert.ok(Array.isArray(item.entityIds) && item.entityIds.length > 0);
      assert.ok(item.fragment && typeof item.fragment === "object" && !Array.isArray(item.fragment));
    }
  }
});

test("fixture product and scenario identifiers are stable and collision-free", async () => {
  const inventory = await fixtures();
  const productIds = inventory.products.map((product) => product.productId);
  const endpoints = inventory.products.map((product) => product.endpoint);
  const schemas = inventory.products.map((product) => product.schema);
  const scenarioIds = inventory.products.flatMap((product) => product.scenarios.map((item) => item.scenarioId));
  const entityIds = inventory.products.flatMap((product) => product.scenarios.flatMap((item) => item.entityIds));
  for (const [label, values] of [["product", productIds], ["endpoint", endpoints], ["schema", schemas], ["scenario", scenarioIds], ["entity", entityIds]]) {
    assert.equal(new Set(values).size, values.length, `${label} identifiers must be unique`);
  }
  for (const id of [...scenarioIds, ...entityIds]) assert.match(id, /^[a-z][a-z0-9-]+$/);
  for (const product of inventory.products) {
    for (const item of product.scenarios) {
      const declared = new Set(item.entityIds);
      for (const id of fragmentIds(item.fragment)) {
        assert.ok(declared.has(id), `${item.scenarioId} must declare fragment ID ${id}`);
      }
    }
  }

  for (const product of inventory.products) {
    const schema = JSON.parse(await readFile(new URL(`../contracts/mobile/v1/${product.schema}`, import.meta.url), "utf8"));
    assert.match(schema.$schema, /2020-12/);
    assert.equal(schema.$id, `urn:bagger:mobile:v1:${product.productId === "historyDetail" ? "history-detail" : product.productId}`);
  }
});

test("Passport fixtures cover veteran, new, empty-record, non-captain, and long-career states", async () => {
  const product = (await fixtures()).products.find((item) => item.productId === "passport");
  assert.ok(scenario(product, "passport-veteran").fragment.career.summary.appearances >= 10);
  assert.deepEqual(scenario(product, "passport-new-player").fragment.career.tournamentHistory, []);
  assert.deepEqual(scenario(product, "passport-no-records").fragment.career.recordsHeld, []);
  assert.deepEqual(scenario(product, "passport-no-captain").fragment.career.captainLegacy.seasons, []);
  const years = scenario(product, "passport-long-history").expectations.historyYears;
  assert.ok(years.length >= 15);
  assert.deepEqual([...years].sort((left, right) => left - right), years);
  assert.equal(new Set(years).size, years.length);
});

test("Guide fixtures cover population, withdrawal, long rules, multiple courses, and absent actions", async () => {
  const product = (await fixtures()).products.find((item) => item.productId === "guide");
  const populated = scenario(product, "guide-populated").fragment;
  for (const field of ["overview", "courses", "dining", "localGuide", "contacts"]) assert.ok(populated[field].length > 0);
  assert.ok(populated.rules.items.length > 0);

  const withdrawn = scenario(product, "guide-withdrawn").fragment;
  assert.equal(withdrawn.publicationState, "UNPUBLISHED");
  assert.equal(withdrawn.publishedAt, null);
  assert.equal(withdrawn.tournament, null);
  for (const field of ["overview", "courses", "dining", "localGuide", "contacts"]) assert.deepEqual(withdrawn[field], []);
  assert.deepEqual(withdrawn.rules, { roundFormats: [], items: [] });

  const longRule = scenario(product, "guide-long-rules");
  assert.ok(longRule.fragment.rules.items[0].body.length >= longRule.expectations.minimumRuleCharacters);
  assert.ok(scenario(product, "guide-multiple-courses").fragment.courses.length >= 3);
  const noActions = scenario(product, "guide-missing-optional-actions").fragment;
  for (const entry of [...noActions.contacts, ...noActions.localGuide]) {
    assert.equal(entry.phone, null);
    assert.equal(entry.website, null);
  }
  assert.equal(noActions.contacts[0].email, null);
});

test("History fixtures separate archive lifecycle from bounded detail and missing scorecards", async () => {
  const inventory = await fixtures();
  const archive = inventory.products.find((item) => item.productId === "history");
  const detail = inventory.products.find((item) => item.productId === "historyDetail");
  const current = scenario(archive, "history-current").fragment.tournaments[0];
  assert.equal(current.status, "inProgress");
  assert.equal(current.champion, null);
  assert.equal(current.finalScore, null);
  const completed = scenario(archive, "history-completed").fragment.tournaments[0];
  assert.equal(completed.status, "final");
  assert.ok(completed.champion);
  assert.ok(completed.finalScore);
  assert.ok(scenario(archive, "history-many-years").expectations.archiveYears.length >= 9);

  const bounded = scenario(detail, "history-detail-bounded");
  assert.deepEqual(bounded.expectations, {
    maximumTeams: 2,
    maximumRounds: 8,
    maximumMatches: 64,
    maximumStandings: 128,
    maximumAwards: 64,
    maximumScorecards: 256,
  });
  assert.ok(bounded.fragment.teams.length <= bounded.expectations.maximumTeams);
  assert.ok(bounded.fragment.matches.length <= bounded.expectations.maximumMatches);
  assert.deepEqual(scenario(detail, "history-detail-no-scorecard").fragment.scorecards, []);
});

test("Records fixtures cover single and tied holders, multiple categories, empty, and long content", async () => {
  const product = (await fixtures()).products.find((item) => item.productId === "records");
  const single = scenario(product, "records-single-holder").fragment.categories[0].records[0];
  assert.equal(single.tied, false);
  assert.equal(single.holders.length, 1);
  const tied = scenario(product, "records-tied-holders").fragment.categories[0].records[0];
  assert.equal(tied.tied, true);
  assert.ok(tied.holders.length >= 2);
  assert.ok(scenario(product, "records-multiple-categories").fragment.categories.length >= 3);
  assert.deepEqual(scenario(product, "records-empty").fragment.categories, []);
  const longScenario = scenario(product, "records-long-content");
  const long = longScenario.expectations;
  const longRecord = longScenario.fragment.categories[0].records[0];
  assert.ok(longRecord.title.length >= long.minimumTitleCharacters);
  assert.ok(longRecord.holders[0].displayName.length >= long.minimumHolderNameCharacters);
});

test("Odds fixtures cover publication, withdrawal, long names, ties, and numeric boundaries", async () => {
  const product = (await fixtures()).products.find((item) => item.productId === "odds");
  assert.equal(scenario(product, "odds-published").fragment.publication.state, "PUBLISHED");
  const unpublished = scenario(product, "odds-unpublished").fragment;
  assert.equal(unpublished.publication.state, "UNPUBLISHED");
  assert.equal(unpublished.publication.publishedAt, null);
  assert.deepEqual(unpublished.snapshots, []);
  const longName = scenario(product, "odds-long-names");
  assert.ok(longName.fragment.snapshots[0].players[0].displayName.length >=
    longName.expectations.minimumPlayerNameCharacters);
  const tie = scenario(product, "odds-tied-ranks").fragment.snapshots[0].players;
  assert.equal(tie[0].rank, tie[1].rank);
  const boundaries = scenario(product, "odds-edge-values").fragment.snapshots[0].players.map((player) => player.probability);
  assert.deepEqual(boundaries, [0, 100]);
});

test("fixture inventory contains no credentials, identity secrets, UUIDs, or non-synthetic action data", async () => {
  const inventory = await fixtures();
  const forbiddenKey = /^(?:accessToken|refreshToken|bearerToken|certification|otp|turnstileToken|serviceRoleKey|apiKey|password|secret|authUserId|phoneE164)$/i;
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
  const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
  walk(inventory, (value, path) => {
    const key = String(path.at(-1) ?? "");
    assert.equal(forbiddenKey.test(key), false, `Sensitive key at ${path.join(".")}`);
    if (typeof value !== "string") return;
    assert.equal(uuid.test(value), false, `UUID-like value at ${path.join(".")}`);
    assert.equal(jwt.test(value), false, `JWT-like value at ${path.join(".")}`);
    assert.equal(/sb_(?:secret|publishable)_/i.test(value), false, `Supabase credential-like value at ${path.join(".")}`);
    assert.equal(/\.supabase\.co/i.test(value), false, `Supabase host at ${path.join(".")}`);
    if (key === "email") assert.match(value, /^[^@\s]+@example\.invalid$/);
    if (key === "phone") assert.match(value, /555/);
    if (/^(?:website|directionsUrl|reservationUrl)$/.test(key)) {
      assert.equal(new URL(value).hostname.endsWith(".example.invalid"), true);
    }
  });
});
