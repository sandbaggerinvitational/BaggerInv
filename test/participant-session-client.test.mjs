import assert from "node:assert/strict";
import test from "node:test";

import { readFreshPlayerPassportSession } from "../lib/participant-session-client.js";

test("concurrent participant shell reads share one fresh request without caching later revalidation", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, status: 200, json: async () => ({ active: true }) };
  };
  try {
    const [first, second] = await Promise.all([
      readFreshPlayerPassportSession(),
      readFreshPlayerPassportSession(),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
    await readFreshPlayerPassportSession();
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
