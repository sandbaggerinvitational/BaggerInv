import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryScoringStore,
  createScoringSyncQueue,
  sameGrossScores,
  scoringSyncSummary,
} from "../lib/scoring-sync-queue.js";

const mutation = (holeNumber, overrides = {}) => ({
  tournamentId: "2026",
  matchId: "2026-R3-2",
  holeNumber,
  team1GrossScores: [4],
  team2GrossScores: [5],
  expectedRevision: 0,
  expectedUpdatedAt: "base",
  optimisticHole: { "Hole Number": holeNumber, "Team 1 Gross Scores": [4], "Team 2 Gross Scores": [5] },
  ...overrides,
});

const until = async (predicate, timeout = 1000) => {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for queue state.");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
};

test("durable scoring queue sends holes in order and carries authoritative revisions forward", async () => {
  const store = createMemoryScoringStore();
  const sent = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push({ hole: entry.holeNumber, updatedAt: entry.expectedUpdatedAt });
    return { hole: { "Hole Number": entry.holeNumber, Revision: 1 }, updatedAt: `saved-${entry.holeNumber}` };
  }});
  await queue.enqueue(mutation(7));
  await queue.enqueue(mutation(8));
  await queue.enqueue(mutation(9));
  await until(() => sent.length === 3);
  await until(async () => (await store.list()).length === 0);
  assert.deepEqual(sent, [
    { hole: 7, updatedAt: "base" },
    { hole: 8, updatedAt: "saved-7" },
    { hole: 9, updatedAt: "saved-8" },
  ]);
  queue.stop();
});

test("a queued correction coalesces and the newest unsent score wins", async () => {
  const store = createMemoryScoringStore();
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => ({}) });
  await queue.enqueue(mutation(7));
  await queue.enqueue(mutation(7, { team1GrossScores: [3] }));
  const entries = await queue.entries("2026-R3-2");
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].team1GrossScores, [3]);
  assert.equal(entries[0].version, 2);
  queue.stop();
});

test("a correction entered while the original is syncing is versioned and wins authoritatively", async () => {
  const store = createMemoryScoringStore();
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const sent = [];
  const events = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push({ score: entry.team1GrossScores[0], revision: entry.expectedRevision });
    if (sent.length === 1) await firstGate;
    return { hole: { "Hole Number": 7, Revision: sent.length }, updatedAt: `revision-${sent.length}` };
  }});
  queue.subscribe((event) => events.push(event));
  await queue.enqueue(mutation(7));
  await until(() => sent.length === 1);
  await queue.enqueue(mutation(7, { team1GrossScores: [3] }));
  releaseFirst();
  await until(() => sent.length === 2);
  await until(async () => (await store.list()).length === 0);
  assert.deepEqual(sent, [{ score: 4, revision: 0 }, { score: 3, revision: 1 }]);
  assert.equal(events.some((event) => event.event === "confirmed" && event.stale), true);
  queue.stop();
});

test("transient failure remains durable and retry does not duplicate the mutation", async () => {
  const store = createMemoryScoringStore();
  let attempts = 0;
  const scheduled = [];
  const queue = createScoringSyncQueue({
    store,
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    send: async (entry) => {
      attempts += 1;
      if (attempts === 1) { const error = new Error("Workbook temporarily unavailable"); error.status = 503; throw error; }
      return { hole: { "Hole Number": entry.holeNumber, Revision: 1 }, updatedAt: "confirmed" };
    },
  });
  await queue.enqueue(mutation(10));
  await until(async () => (await store.list())[0]?.status === "retryable");
  assert.equal((await store.list()).length, 1);
  await queue.retry();
  await until(() => attempts === 2);
  await until(async () => (await store.list()).length === 0);
  assert.equal(attempts, 2);
  queue.stop();
});

test("reload reconciliation confirms exact server values and flags newer conflicting revisions", async () => {
  const exactStore = createMemoryScoringStore();
  const exactQueue = createScoringSyncQueue({ store: exactStore, online: () => false, send: async () => ({}) });
  await exactQueue.enqueue(mutation(11));
  await exactQueue.reconcile("2026-R3-2", [{ "Hole Number": 11, "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, Revision: 1 }]);
  assert.equal((await exactQueue.entries("2026-R3-2")).length, 0);
  exactQueue.stop();

  const conflictStore = createMemoryScoringStore();
  const conflictQueue = createScoringSyncQueue({ store: conflictStore, online: () => false, send: async () => ({}) });
  await conflictQueue.enqueue(mutation(12));
  await conflictQueue.reconcile("2026-R3-2", [{ "Hole Number": 12, "Team 1 Gross Scores": 6, "Team 2 Gross Scores": 5, Revision: 2 }]);
  assert.equal((await conflictStore.list())[0].status, "conflict");
  conflictQueue.stop();
});

test("reload recovers an interrupted syncing mutation against the latest match timestamp", async () => {
  const store = createMemoryScoringStore([{
    ...mutation(13), id: "2026:2026-R3-2:H13:V1", version: 1, sequence: 1,
    clientMutationId: "restart-test", status: "syncing", attempts: 1, createdAt: 1,
  }]);
  const sent = [];
  const queue = createScoringSyncQueue({ store, online: () => false, send: async (entry) => { sent.push(entry); return {}; } });
  await queue.reconcile("2026-R3-2", [], { "Updated At": "fresh-server-version" });
  const recovered = (await store.list())[0];
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.expectedUpdatedAt, "fresh-server-version");
  assert.equal(sent.length, 0);
  queue.stop();
});

test("network, timeout, abort, 500, and 503 failures retry while authorization/lifecycle failures stop", async () => {
  const cases = [
    ["network", 0, "retryable"], ["timeout", 0, "retryable"], ["AbortError", 0, "retryable"],
    ["server", 500, "retryable"], ["freshness", 503, "retryable"],
    ["passport", 401, "conflict"], ["locked", 400, "conflict"], ["finalized", 400, "conflict"],
  ];
  for (const [message, status, expected] of cases) {
    const store = createMemoryScoringStore();
    const queue = createScoringSyncQueue({
      store,
      schedule: () => 1,
      send: async () => { const error = new Error(message); error.status = status; throw error; },
    });
    await queue.enqueue(mutation(14));
    await until(async () => (await store.list())[0]?.status === expected);
    assert.equal((await store.list())[0].status, expected, message);
    queue.stop();
  }
});

test("sync summaries distinguish confirmed, syncing, offline, retry, and conflict states", () => {
  assert.equal(scoringSyncSummary([], true).text, "All scores synced");
  assert.equal(scoringSyncSummary([{ status: "queued" }, { status: "syncing" }], true).text, "Syncing 2 holes…");
  assert.match(scoringSyncSummary([{ status: "queued" }], false).text, /saved on this device/);
  assert.match(scoringSyncSummary([{ status: "retryable" }], true).text, /Tap to retry sync/);
  assert.match(scoringSyncSummary([{ status: "conflict" }], true).text, /needs attention/);
  assert.equal(sameGrossScores(mutation(1), { "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5 }), true);
});

test("Preview alone enables local-first scoring while Production keeps verified save-before-advance", async () => {
  const { readFile } = await import("node:fs/promises");
  const [scorePage, myMatchPage, component] = await Promise.all([
    readFile(new URL("../app/score/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/my-match/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
  ]);
  assert.match(scorePage, /localFirstEnabled=\{previewMode\}/);
  assert.match(myMatchPage, /localFirstEnabled=\{previewMode\}/);
  assert.match(component, /createIndexedDbScoringStore/);
  assert.match(component, /syncQueue\.current\.enqueue/);
  assert.match(component, /Syncing remaining scores before final submission/);
  assert.match(component, /save = localFirstEnabled \? saveLocally : saveAuthoritatively/);
});
