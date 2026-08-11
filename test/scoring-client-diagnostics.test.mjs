import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryScoringDiagnosticsStore, scoringDiagnosticId } from "../lib/scoring-client-diagnostics.js";

test("Preview scoring diagnostics persist and merge local, authority, and queue-clear timing", async () => {
  const store = createMemoryScoringDiagnosticsStore();
  const identity = { matchId: "2026-R3-4", holeNumber: 2, clientMutationId: "iphone-hole-2" };
  assert.equal(scoringDiagnosticId(identity), "2026-R3-4:iphone-hole-2");
  await store.upsert({ ...identity, validationMs: 1, indexedDbCommitMs: 4, tapToVisualAdvanceMs: 18 });
  await store.upsert({ ...identity, authoritativeConfirmationMs: 305 });
  await store.upsert({ ...identity, queueClearMs: 322 });
  const [sample] = await store.list();
  assert.equal(sample.validationMs, 1);
  assert.equal(sample.indexedDbCommitMs, 4);
  assert.equal(sample.tapToVisualAdvanceMs, 18);
  assert.equal(sample.authoritativeConfirmationMs, 305);
  assert.equal(sample.queueClearMs, 322);
});
