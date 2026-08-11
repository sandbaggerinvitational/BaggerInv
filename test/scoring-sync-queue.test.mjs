import assert from "node:assert/strict";
import test from "node:test";
import {
  actionableScoringEntries,
  classifyScoringSyncFailure,
  createMemoryScoringStore,
  createScoringSyncQueue,
  hasAuthoritativeGrossScores,
  participantScoringSyncIssue,
  sameGrossScores,
  sameScoringIntent,
  scoringFinalizationReview,
  scoringSyncIssueKind,
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

test("an unchanged queued score reuses its durable identity instead of creating another mutation", async () => {
  const store = createMemoryScoringStore();
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => assert.fail("offline queue must not send") });
  const first = await queue.enqueue(mutation(3, { clientMutationId: "durable-hole-3" }));
  const repeated = await queue.enqueue(mutation(3));
  const entries = await queue.entries("2026-R3-2");
  assert.equal(entries.length, 1);
  assert.equal(repeated.clientMutationId, first.clientMutationId);
  assert.equal(repeated.coalesced, true);
  assert.equal(entries[0].version, 1);
  queue.stop();
});

test("an unchanged score submitted while its first request is syncing keeps the same identity", async () => {
  const store = createMemoryScoringStore();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sent = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push(entry.clientMutationId);
    await gate;
    return { hole: { "Hole Number": 3, Revision: 1 }, matchRevision: 1 };
  }});
  const first = await queue.enqueue(mutation(3, { clientMutationId: "syncing-hole-3" }));
  await until(() => sent.length === 1);
  const repeated = await queue.enqueue(mutation(3));
  assert.equal(repeated.clientMutationId, first.clientMutationId);
  assert.equal(repeated.coalesced, true);
  release();
  await until(async () => (await store.list()).length === 0);
  assert.deepEqual(sent, ["syncing-hole-3"]);
  queue.stop();
});

test("an unchanged authoritative hole is a client no-op with no queue write", async () => {
  const store = createMemoryScoringStore();
  let sends = 0;
  const queue = createScoringSyncQueue({ store, send: async () => { sends += 1; return {}; } });
  const unchanged = await queue.enqueue(mutation(3, {
    authoritativeHole: { "Hole Number": 3, "Team 1 Gross Scores": [4], "Team 2 Gross Scores": [5], Revision: 7 },
  }));
  assert.equal(unchanged.noChange, true);
  assert.equal(unchanged.clientMutationId, "");
  assert.equal((await store.list()).length, 0);
  assert.equal(sends, 0);
  queue.stop();
});

test("route remount, IndexedDB hydration, and authoritative reconciliation do not synthesize a mutation", async () => {
  const store = createMemoryScoringStore();
  let sends = 0;
  const queue = createScoringSyncQueue({ store, send: async () => { sends += 1; return {}; } });
  assert.deepEqual(await queue.hydrate("2026-R3-2"), []);
  await queue.reconcile("2026-R3-2", [
    { "Hole Number": 3, "Team 1 Gross Scores": [4], "Team 2 Gross Scores": [5], Revision: 1 },
  ], { Revision: 3, matchRevision: 3 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(sends, 0);
  assert.equal((await store.list()).length, 0);
  queue.stop();
});

test("a genuine canonical correction creates a new durable mutation", async () => {
  const store = createMemoryScoringStore();
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => ({}) });
  const original = await queue.enqueue(mutation(3, { clientMutationId: "original-hole-3" }));
  const correction = await queue.enqueue(mutation(3, { team2GrossScores: [4], clientMutationId: "corrected-hole-3" }));
  assert.equal(sameScoringIntent(original, correction), false);
  assert.notEqual(correction.clientMutationId, original.clientMutationId);
  assert.deepEqual((await queue.entries("2026-R3-2")).map((entry) => entry.clientMutationId), ["corrected-hole-3"]);
  queue.stop();
});

test("rapid five-hole scoring creates exactly one logical mutation per unchanged hole", async () => {
  const store = createMemoryScoringStore();
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const sent = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push({ hole: entry.holeNumber, key: entry.clientMutationId, expectedMatchRevision: entry.expectedMatchRevision });
    if (entry.holeNumber === 3) await first;
    return { hole: { "Hole Number": entry.holeNumber, Revision: 1 }, matchRevision: entry.holeNumber };
  }});
  for (const hole of [3, 4, 5, 6, 7]) await queue.enqueue(mutation(hole, {
    expectedMatchRevision: 2,
    clientMutationId: `rapid-hole-${hole}`,
  }));
  releaseFirst();
  await until(() => sent.length === 5);
  await until(async () => (await store.list()).length === 0);
  assert.deepEqual(sent.map((entry) => entry.hole), [3, 4, 5, 6, 7]);
  assert.equal(new Set(sent.map((entry) => entry.key)).size, 5);
  assert.deepEqual(sent.map((entry) => entry.expectedMatchRevision), [2, 3, 4, 5, 6]);
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
    ["passport", 401, "action-required"], ["locked", 400, "action-required"], ["finalized", 400, "action-required"],
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

test("sync summaries identify the exact actionable holes without exposing technical errors", () => {
  assert.equal(scoringSyncSummary([], true).text, "All scores synced");
  assert.equal(scoringSyncSummary([{ status: "queued" }, { status: "syncing" }], true).text, "Syncing 2 holes…");
  assert.match(scoringSyncSummary([{ status: "queued" }], false).text, /saved on this device/);
  assert.equal(scoringSyncSummary([{ status: "retryable", holeNumber: 7, sequence: 1 }], true).text, "HOLE 7 NEEDS ATTENTION · TAP TO REVIEW");
  assert.equal(scoringSyncSummary([
    { status: "retryable", holeNumber: 7, sequence: 1 },
    { status: "conflict", holeNumber: 9, sequence: 2 },
  ], true).text, "2 SCORES NEED ATTENTION · HOLES 7, 9");
  assert.equal(scoringSyncSummary([
    { status: "retryable", holeNumber: 2, sequence: 1 },
    { status: "retryable", holeNumber: 4, sequence: 2 },
    { status: "retryable", holeNumber: 6, sequence: 3 },
    { status: "retryable", holeNumber: 8, sequence: 4 },
  ], true).text, "4 SCORES NEED ATTENTION · TAP TO REVIEW");
  assert.equal(sameGrossScores(mutation(1), { "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5 }), true);
});

test("Final submission review names every unresolved hole and updates its count", () => {
  const three = [
    { status: "conflict", holeNumber: 8, sequence: 1 },
    { status: "conflict", holeNumber: 10, sequence: 2 },
    { status: "conflict", holeNumber: 11, sequence: 3 },
  ];
  assert.deepEqual(scoringFinalizationReview(three), {
    count: 3,
    holes: [8, 10, 11],
    reviewText: "3 scores need review before Final submission · Holes 8, 10, 11",
    buttonText: "Resolve 3 score issues before submitting Final.",
  });
  assert.equal(scoringFinalizationReview(three.slice(1)).buttonText, "Resolve 2 score issues before submitting Final.");
  assert.equal(scoringFinalizationReview(three.slice(2)).reviewText, "1 score needs review before Final submission · Hole 11");
  assert.equal(scoringFinalizationReview([]).count, 0);
});

test("failure classification produces participant-safe retry, conflict, authorization, lock, and finalized guidance", () => {
  assert.deepEqual(classifyScoringSyncFailure({ status: 503, message: "workbook unavailable" }), {
    status: "retryable", kind: "retryable", message: "Score saved on this device. Tap Retry Sync.",
  });
  assert.equal(classifyScoringSyncFailure({ status: 409, message: "updated by someone else" }).kind, "conflict");
  assert.equal(classifyScoringSyncFailure({ status: 400, message: "Scoring has been locked" }).kind, "locked");
  assert.equal(classifyScoringSyncFailure({ status: 400, message: "This match is Final. Reopen it." }).kind, "finalized");
  assert.equal(classifyScoringSyncFailure({ status: 401, message: "Player Passport expired" }).kind, "authorization");
  assert.equal(participantScoringSyncIssue({ failureKind: "locked", participantMessage: "Scoring has been locked by the Tournament Director." }), "Scoring has been locked by the Tournament Director.");
});

test("legacy durable conflicts normalize from mismatch evidence instead of falling through to lifecycle UI", async () => {
  const legacy = {
    ...mutation(8), id: "2026:2026-R3-2:H8:V1", version: 1, sequence: 1,
    clientMutationId: "legacy-conflict", status: "action-required", attempts: 1, createdAt: 1,
    participantMessage: "Server score differs from this device. Review before continuing.",
  };
  assert.equal(scoringSyncIssueKind(legacy), "conflict");
  assert.equal(scoringSyncIssueKind({ status: "action-required", failureKind: "locked" }), "locked");
  assert.equal(scoringSyncIssueKind({ status: "retryable" }), "retryable");
  assert.equal(scoringSyncIssueKind(null), "action-required");

  const store = createMemoryScoringStore([legacy]);
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => ({}) });
  await queue.reconcile("2026-R3-2", [{ "Hole Number": 8, "Team 1 Gross Scores": 3, "Team 2 Gross Scores": 5, Revision: 2 }], { "Updated At": "server-v2", canConfirm: true });
  const repaired = (await queue.entries("2026-R3-2"))[0];
  assert.equal(repaired.status, "conflict");
  assert.equal(repaired.failureKind, "conflict");
  assert.equal(repaired.authoritativeHole["Team 1 Gross Scores"], 3);
  assert.equal(repaired.authoritativeCanConfirm, true);
  queue.stop();
});

test("identical authoritative scores auto-resolve despite stale conflict metadata and revision", async () => {
  const identical = {
    ...mutation(8), id: "2026:2026-R3-2:H8:V1", version: 1, sequence: 1,
    clientMutationId: "equivalent-conflict", status: "conflict", failureKind: "conflict", attempts: 1, createdAt: 1,
    participantMessage: "Server score differs from this device. Review before continuing.",
    authoritativeHole: { "Hole Number": 8, "Team 1 Gross Scores": "4", "Team 2 Gross Scores": "5", Revision: 7 },
  };
  assert.equal(scoringSyncIssueKind(identical), "confirmed");
  assert.equal(actionableScoringEntries([identical]).length, 0);
  assert.equal(scoringSyncSummary([identical], true).text, "All scores synced");

  const store = createMemoryScoringStore([identical]);
  let writes = 0;
  const events = [];
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => { writes += 1; return {}; } });
  queue.subscribe((event) => events.push(event));
  await queue.reconcile("2026-R3-2", [{ "Hole Number": 8, "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, Revision: 8 }], { "Updated At": "server-v8", canConfirm: true });
  assert.equal((await queue.entries("2026-R3-2")).length, 0);
  assert.equal(writes, 0);
  assert.equal(events.some((event) => event.event === "confirmed" && event.equivalent && event.result.matchComplete), true);
  queue.stop();
});

test("a blank authoritative hole is retryable rather than a competing score", async () => {
  const blankConflict = {
    ...mutation(13), id: "blank-conflict", version: 1, sequence: 1,
    status: "conflict", failureKind: "conflict", attempts: 1, createdAt: 1,
    participantMessage: "Server score differs from this device. Review before continuing.",
    authoritativeHole: { "Hole Number": 13, "Team 1 Gross Scores": "", "Team 2 Gross Scores": null, Revision: 0 },
  };
  assert.equal(hasAuthoritativeGrossScores(blankConflict.authoritativeHole), false);
  assert.equal(scoringSyncIssueKind(blankConflict), "retryable");
  assert.equal(participantScoringSyncIssue(blankConflict), "Score saved on this device. Tap Retry Sync.");

  const store = createMemoryScoringStore([blankConflict]);
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => assert.fail("reconcile must not write") });
  await queue.reconcile("2026-R3-2", [blankConflict.authoritativeHole], { "Updated At": "server-blank" });
  const repaired = (await queue.entries("2026-R3-2"))[0];
  assert.equal(repaired.status, "retryable");
  assert.equal(repaired.failureKind, "retryable");
  assert.equal(repaired.authoritativeHole, null);
  queue.stop();
});

test("a newer local edit coalesces a blank-server issue into the newest durable mutation", async () => {
  const old = {
    ...mutation(13, {
      team1GrossScores: [5], team2GrossScores: [3],
      optimisticHole: { "Hole Number": 13, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [3] },
    }),
    id: "old-blank-conflict", version: 1, sequence: 1, status: "conflict", failureKind: "conflict",
    authoritativeHole: { "Hole Number": 13, "Team 1 Gross Scores": "", "Team 2 Gross Scores": "" },
  };
  const store = createMemoryScoringStore([old]);
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => ({}) });
  await queue.enqueue(mutation(13, {
    team1GrossScores: [5], team2GrossScores: [4],
    optimisticHole: { "Hole Number": 13, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [4] },
  }));
  const entries = await queue.entries("2026-R3-2");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].version, 2);
  assert.deepEqual(entries[0].team1GrossScores, [5]);
  assert.deepEqual(entries[0].team2GrossScores, [4]);
  assert.deepEqual(entries[0].optimisticHole["Team 2 Gross Scores"], [4]);
  assert.equal(entries[0].status, "queued");
  queue.stop();
});

test("a real server value appearing after a blank-server issue remains a genuine conflict", async () => {
  const old = {
    ...mutation(13, {
      team1GrossScores: [5], team2GrossScores: [4],
      optimisticHole: { "Hole Number": 13, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [4] },
    }),
    id: "blank-then-server", version: 2, sequence: 1, status: "conflict", failureKind: "conflict",
    authoritativeHole: { "Hole Number": 13, "Team 1 Gross Scores": "", "Team 2 Gross Scores": "" },
  };
  const store = createMemoryScoringStore([old]);
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => ({}) });
  await queue.reconcile("2026-R3-2", [{ "Hole Number": 13, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [3], Revision: 3 }]);
  const conflict = (await queue.entries("2026-R3-2"))[0];
  assert.equal(scoringSyncIssueKind(conflict), "conflict");
  assert.deepEqual(conflict.authoritativeHole["Team 2 Gross Scores"], [3]);
  queue.stop();
});

test("an equivalent issue disappears while the next genuine mismatch remains actionable", async () => {
  const equivalent = {
    ...mutation(8), id: "equivalent", version: 1, sequence: 1, status: "conflict", failureKind: "conflict",
    authoritativeHole: { "Hole Number": 8, "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, Revision: 2 },
  };
  const mismatch = {
    ...mutation(10), id: "mismatch", version: 1, sequence: 2, status: "conflict", failureKind: "conflict",
    authoritativeHole: { "Hole Number": 10, "Team 1 Gross Scores": 3, "Team 2 Gross Scores": 5, Revision: 2 },
  };
  assert.deepEqual(actionableScoringEntries([equivalent, mismatch]).map((entry) => entry.holeNumber), [10]);
  const store = createMemoryScoringStore([equivalent, mismatch]);
  const queue = createScoringSyncQueue({ store, online: () => false, send: async () => ({}) });
  await queue.reconcile("2026-R3-2", [equivalent.authoritativeHole, mismatch.authoritativeHole]);
  const remaining = await queue.entries("2026-R3-2");
  assert.deepEqual(remaining.map((entry) => entry.holeNumber), [10]);
  assert.equal(scoringSyncIssueKind(remaining[0]), "conflict");
  queue.stop();
});

test("actionable holes are reviewed oldest-first", () => {
  const entries = actionableScoringEntries([
    { status: "conflict", holeNumber: 9, sequence: 4 },
    { status: "queued", holeNumber: 10, sequence: 5 },
    { status: "retryable", holeNumber: 7, sequence: 2 },
    { status: "action-required", holeNumber: 8, sequence: 3 },
  ]);
  assert.deepEqual(entries.map((entry) => entry.holeNumber), [7, 8, 9]);
});

test("a lifecycle-blocked hole can be checked again after Director action", async () => {
  const blocked = {
    ...mutation(15), id: "2026:2026-R3-2:H15:V1", version: 1, sequence: 1,
    clientMutationId: "blocked", status: "action-required", failureKind: "locked", attempts: 1, createdAt: 1,
  };
  const store = createMemoryScoringStore([blocked]);
  let sent = 0;
  const queue = createScoringSyncQueue({ store, send: async () => {
    sent += 1;
    return { hole: { "Hole Number": 15, Revision: 1 }, updatedAt: "unlocked" };
  }});
  await queue.retryEntry(blocked.id);
  await until(() => sent === 1);
  await until(async () => (await store.list()).length === 0);
  queue.stop();
});

test("a reviewed conflict resolves explicitly to the server or newest device score", async () => {
  const conflict = {
    ...mutation(16), id: "2026:2026-R3-2:H16:V1", version: 1, sequence: 1,
    clientMutationId: "conflict", status: "conflict", failureKind: "conflict", attempts: 1, createdAt: 1,
    authoritativeHole: { "Hole Number": 16, "Team 1 Gross Scores": 3, "Team 2 Gross Scores": 4, Revision: 2 },
    authoritativeMatchUpdatedAt: "server-v2",
    authoritativeCanConfirm: true,
  };
  const serverStore = createMemoryScoringStore([conflict]);
  const serverQueue = createScoringSyncQueue({ store: serverStore, send: async () => assert.fail("server resolution must not rewrite") });
  let serverResult;
  serverQueue.subscribe((event) => { if (event.resolution === "server") serverResult = event.result; });
  assert.equal(await serverQueue.resolveConflict(conflict.id, "server"), true);
  assert.equal((await serverStore.list()).length, 0);
  assert.equal(serverResult.matchComplete, true);
  serverQueue.stop();

  const deviceStore = createMemoryScoringStore([conflict]);
  let sent;
  const deviceQueue = createScoringSyncQueue({ store: deviceStore, send: async (entry) => {
    sent = entry;
    return { hole: { "Hole Number": 16, Revision: 3 }, updatedAt: "server-v3" };
  }});
  assert.equal(await deviceQueue.resolveConflict(conflict.id, "device"), true);
  await until(() => Boolean(sent));
  assert.equal(sent.expectedRevision, 2);
  assert.equal(sent.expectedUpdatedAt, "server-v2");
  await until(async () => (await deviceStore.list()).length === 0);
  deviceQueue.stop();
});

test("a rejected stale mutation auto-confirms when authoritative scores are already equivalent", async () => {
  const store = createMemoryScoringStore();
  let sendAttempts = 0;
  const events = [];
  const queue = createScoringSyncQueue({
    store,
    send: async () => {
      sendAttempts += 1;
      const error = new Error("The scorecard changed after this device loaded it.");
      error.status = 409;
      throw error;
    },
    readAuthoritative: async () => ({
      holeScores: [{ "Hole Number": 8, "Team 1 Gross Scores": "4", "Team 2 Gross Scores": 5, Revision: 9 }],
      match: { "Updated At": "server-v9" },
      canConfirm: true,
    }),
  });
  queue.subscribe((event) => events.push(event));
  await queue.enqueue(mutation(8));
  await until(async () => (await store.list()).length === 0);
  assert.equal(sendAttempts, 1);
  assert.equal(events.some((event) => event.event === "conflict"), false);
  assert.equal(events.some((event) => event.event === "confirmed" && event.equivalent && event.result.matchComplete), true);
  assert.equal(scoringSyncSummary(await store.list(), true).text, "All scores synced");
  queue.stop();
});

test("a rejected mutation with a blank server hole becomes retryable and then verifies", async () => {
  const store = createMemoryScoringStore();
  let attempts = 0;
  const queue = createScoringSyncQueue({
    store,
    schedule: () => 1,
    send: async (entry) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("The scorecard changed after this device loaded it.");
        error.status = 409;
        throw error;
      }
      assert.deepEqual(entry.team1GrossScores, [5]);
      assert.deepEqual(entry.team2GrossScores, [4]);
      assert.equal(entry.expectedUpdatedAt, "server-blank");
      return { hole: { "Hole Number": 13, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [4], Revision: 1 }, updatedAt: "server-saved" };
    },
    readAuthoritative: async () => ({
      holeScores: [{ "Hole Number": 13, "Team 1 Gross Scores": "", "Team 2 Gross Scores": "", Revision: 0 }],
      match: { "Updated At": "server-blank" },
      canConfirm: false,
    }),
  });
  await queue.enqueue(mutation(13, {
    team1GrossScores: [5], team2GrossScores: [4],
    optimisticHole: { "Hole Number": 13, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [4] },
  }));
  await until(async () => (await store.list())[0]?.status === "retryable");
  assert.equal(scoringSyncIssueKind((await store.list())[0]), "retryable");
  await queue.retryEntry((await store.list())[0].id);
  await until(async () => (await store.list()).length === 0);
  assert.equal(attempts, 2);
  queue.stop();
});

test("multiple conflicts clear oldest-first and expose the next affected hole", async () => {
  const conflicts = [8, 10, 11].map((holeNumber, index) => ({
    ...mutation(holeNumber), id: `2026:2026-R3-2:H${holeNumber}:V1`, version: 1, sequence: index + 1,
    clientMutationId: `conflict-${holeNumber}`, status: "conflict", failureKind: "conflict", attempts: 1, createdAt: index + 1,
    authoritativeHole: { "Hole Number": holeNumber, "Team 1 Gross Scores": 3, "Team 2 Gross Scores": 4, Revision: 2 },
  }));
  const store = createMemoryScoringStore(conflicts);
  const queue = createScoringSyncQueue({ store, send: async () => assert.fail("server resolution must not write") });
  assert.deepEqual((await queue.entries("2026-R3-2")).map((entry) => entry.holeNumber), [8, 10, 11]);
  await queue.resolveConflict(conflicts[0].id, "server");
  assert.deepEqual(actionableScoringEntries(await queue.entries("2026-R3-2")).map((entry) => entry.holeNumber), [10, 11]);
  await queue.resolveConflict(conflicts[1].id, "server");
  assert.deepEqual(actionableScoringEntries(await queue.entries("2026-R3-2")).map((entry) => entry.holeNumber), [11]);
  await queue.resolveConflict(conflicts[2].id, "server");
  assert.equal((await queue.entries("2026-R3-2")).length, 0);
  queue.stop();
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
  assert.match(component, /reviewFirstSyncIssue/);
  assert.match(component, /participantScoringSyncIssue/);
  assert.match(component, /Retry Sync/);
  assert.match(component, /Check Again/);
  assert.match(component, /Hole .* score conflict/);
  assert.match(component, /Choose the correct score for Hole/);
  assert.match(component, /Use This Device Score/);
  assert.match(component, /Sync the score entered on this device/);
  assert.match(component, /Use Server Score/);
  assert.match(component, /Keep the score already recorded on the server/);
  assert.match(component, /Choose Device or Server Score Above/);
  assert.match(component, /Save Updated Score/);
  assert.match(component, /canResolveScoreConflict/);
  assert.match(component, /has not synced yet/);
  assert.match(component, /canResolveScoreConflict \? <div className=\{styles\.syncResolution\}>/);
  assert.doesNotMatch(component, /activeSyncIssue\?\.failureKind === "conflict"/);
  assert.match(component, /finalizationReview\.buttonText/);
  assert.match(component, /save = localFirstEnabled \? saveLocally : saveAuthoritatively/);
});
