import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryScoringStore, createScoringSyncQueue, scoringSyncIssueKind } from "../lib/scoring-sync-queue.js";
import { mergeParticipantScoringAuthorityState } from "../lib/scoring-participant-authority-state.js";

const until = async (predicate, timeout = 1000) => {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for queue state.");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
};

const mutation = (holeNumber, overrides = {}) => ({
  tournamentId: "2026",
  matchId: "2026-R3-4",
  holeNumber,
  team1GrossScores: [5],
  team2GrossScores: [5],
  expectedRevision: 0,
  expectedMatchRevision: 0,
  expectedUpdatedAt: "google-base",
  optimisticHole: { "Hole Number": holeNumber, "Team 1 Gross Scores": [5], "Team 2 Gross Scores": [5] },
  ...overrides,
});

const authorityState = (revision, holes = [], overrides = {}) => ({
  match: { Revision: revision, matchRevision: revision, "Match Status": "Live", "Scoring Locked": false },
  holeScores: holes,
  authority: { source: "supabase", authorizationVerified: true, writable: true, matchRevision: revision, status: "LIVE", scoringLocked: false },
  ...overrides,
});

test("sequential confirmed holes chain authoritative match revisions even when enqueue state is stale", async () => {
  const store = createMemoryScoringStore();
  const sent = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push({ hole: entry.holeNumber, expectedMatchRevision: entry.expectedMatchRevision });
    return {
      hole: { "Hole Number": entry.holeNumber, Revision: 1 },
      matchRevision: sent.length,
      updatedAt: `supabase-${sent.length}`,
    };
  }});

  for (const hole of [1, 2, 3]) {
    await queue.enqueue(mutation(hole, { expectedMatchRevision: 0 }));
    await until(() => sent.length === hole);
    await until(async () => (await store.list()).length === 0);
  }

  assert.deepEqual(sent, [
    { hole: 1, expectedMatchRevision: 0 },
    { hole: 2, expectedMatchRevision: 1 },
    { hole: 3, expectedMatchRevision: 2 },
  ]);
  queue.stop();
});

test("rapid local-first holes queued during the first request serialize with revision handoff", async () => {
  const store = createMemoryScoringStore();
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const sent = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push({ hole: entry.holeNumber, expectedMatchRevision: entry.expectedMatchRevision });
    if (entry.holeNumber === 1) await firstGate;
    return { hole: { "Hole Number": entry.holeNumber, Revision: 1 }, matchRevision: entry.holeNumber, updatedAt: `supabase-${entry.holeNumber}` };
  }});

  await queue.enqueue(mutation(1));
  await until(() => sent.length === 1);
  await queue.enqueue(mutation(2));
  await queue.enqueue(mutation(3));
  releaseFirst();
  await until(() => sent.length === 3);
  await until(async () => (await store.list()).length === 0);
  assert.deepEqual(sent, [
    { hole: 1, expectedMatchRevision: 0 },
    { hole: 2, expectedMatchRevision: 1 },
    { hole: 3, expectedMatchRevision: 2 },
  ]);
  queue.stop();
});

test("a blank target hole safely rebases the same durable mutation after a match revision conflict", async () => {
  const store = createMemoryScoringStore();
  const sent = [];
  const queue = createScoringSyncQueue({
    store,
    send: async (entry) => {
      sent.push({ key: entry.clientMutationId, expectedMatchRevision: entry.expectedMatchRevision });
      if (sent.length === 1) {
        const error = new Error("This match was updated by someone else. Refresh before saving again.");
        error.status = 409;
        error.code = "MATCH_REVISION_CONFLICT";
        throw error;
      }
      return { hole: { "Hole Number": 2, Revision: 1 }, matchRevision: 2, updatedAt: "supabase-2" };
    },
    readAuthoritative: async () => authorityState(1),
  });
  await queue.enqueue(mutation(2, { clientMutationId: "durable-hole-2" }));
  await until(() => sent.length === 2);
  await until(async () => (await store.list()).length === 0);
  assert.deepEqual(sent, [
    { key: "durable-hole-2", expectedMatchRevision: 0 },
    { key: "durable-hole-2", expectedMatchRevision: 1 },
  ]);
  queue.stop();
});

test("a legacy retryable Hole 2 entry rebases on reload without score re-entry", async () => {
  const durable = {
    ...mutation(2), id: "2026:2026-R3-4:H2:V1", version: 1, sequence: 1,
    clientMutationId: "iphone-hole-2", status: "retryable", failureKind: "retryable",
    failureStatus: 409, lastError: "This match was updated by someone else. Refresh before saving again.",
    attempts: 2, createdAt: 10,
  };
  const store = createMemoryScoringStore([durable]);
  const sent = [];
  const queue = createScoringSyncQueue({ store, send: async (entry) => {
    sent.push(entry);
    return { hole: { "Hole Number": 2, Revision: 1 }, matchRevision: 2, updatedAt: "supabase-2" };
  }});
  await queue.reconcile("2026-R3-4", [], authorityState(1));
  await until(() => sent.length === 1);
  await until(async () => (await store.list()).length === 0);
  assert.equal(sent[0].clientMutationId, "iphone-hole-2");
  assert.equal(sent[0].expectedMatchRevision, 1);
  assert.deepEqual(sent[0].team1GrossScores, [5]);
  assert.deepEqual(sent[0].team2GrossScores, [5]);
  queue.stop();
});

test("two-device same-hole mismatch remains a true conflict and never auto-rebases", async () => {
  const store = createMemoryScoringStore();
  let attempts = 0;
  const queue = createScoringSyncQueue({
    store,
    schedule: () => 1,
    send: async () => {
      attempts += 1;
      const error = new Error("This match was updated by someone else. Refresh before saving again.");
      error.status = 409;
      error.code = "MATCH_REVISION_CONFLICT";
      throw error;
    },
    readAuthoritative: async () => authorityState(1, [{ "Hole Number": 2, "Team 1 Gross Scores": [4], "Team 2 Gross Scores": [5], Revision: 1 }]),
  });
  await queue.enqueue(mutation(2));
  await until(async () => (await store.list())[0]?.status === "conflict");
  const conflict = (await store.list())[0];
  assert.equal(attempts, 1);
  assert.equal(scoringSyncIssueKind(conflict), "conflict");
  assert.deepEqual(conflict.authoritativeHole["Team 1 Gross Scores"], [4]);
  queue.stop();
});

test("participant scoring state takes revisions and current holes from Supabase authority", () => {
  const merged = mergeParticipantScoringAuthorityState({
    match: { "Match ID": "2026-R3-4", "Updated At": "google-time" },
    holeScores: [],
  }, {
    match: { match_id: "2026-R3-4", match_revision: 2, permission_revision: 1, status: "LIVE", scoring_locked: false,
      current_hole: 2, holes_remaining: 16, team_1_holes_won: 0, team_2_holes_won: 1, running_result: "Team 2 1 UP through 2", authority_updated_at: "supabase-time" },
    holes: [{ match_id: "2026-R3-4", hole_number: 2, hole_revision: 1, team_1_gross_scores: [5], team_2_gross_scores: [5], team_1_net_score: 4, team_2_net_score: 5, hole_winner: "Team 1" }],
  }, { authorizationVerified: true });
  assert.equal(merged.match.Revision, 2);
  assert.equal(merged.match.matchRevision, 2);
  assert.equal(merged.holeScores[0]["Hole Number"], 2);
  assert.equal(merged.authority.writable, true);
});
