import assert from "node:assert/strict";
import test from "node:test";
import { verifyDirectorReadBack } from "../lib/director-readback-verification.js";

test("Director read-back invalidates stale state before its first verification", async () => {
  let invalidations = 0;
  const events = [];
  const result = await verifyDirectorReadBack({
    delays: [0],
    invalidate: async () => { invalidations += 1; },
    read: async () => ({ scoringEnabled: true }),
    verify: (data) => data.scoringEnabled,
    summarize: (data) => data,
    onAttempt: (attempt) => events.push(attempt),
  });

  assert.equal(result.success, true);
  assert.equal(invalidations, 1);
  assert.equal(result.attempts.length, 1);
  assert.deepEqual(events[0].values, { scoringEnabled: true });
  assert.ok(events[0].readStartedAt >= events[0].invalidationCompletedAt);
});

test("Director read-back absorbs transient stale reads without repeating the mutation", async () => {
  let reads = 0;
  let invalidations = 0;
  const result = await verifyDirectorReadBack({
    delays: [0, 0, 0],
    invalidate: async () => { invalidations += 1; },
    read: async () => ({ scoringEnabled: ++reads >= 3 }),
    verify: (data) => data.scoringEnabled,
  });

  assert.equal(result.success, true);
  assert.equal(reads, 3);
  assert.equal(invalidations, 3);
  assert.equal(result.attempts.length, 3);
  assert.deepEqual(result.attempts.map((attempt) => attempt.success), [false, false, true]);
});

test("Director read-back fails only after all verification attempts are exhausted", async () => {
  const result = await verifyDirectorReadBack({
    delays: [0, 0, 0, 0],
    invalidate: async () => {},
    read: async () => ({ scoringEnabled: false }),
    verify: (data) => data.scoringEnabled,
  });

  assert.equal(result.success, false);
  assert.equal(result.attempts.length, 4);
});
