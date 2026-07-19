import test from "node:test";
import assert from "node:assert/strict";
import { clientAddress, consumeRateLimit, resetRateLimitsForTests } from "../lib/rate-limit.js";

test("limits repeated requests and resets after the window", () => {
  resetRateLimitsForTests();
  assert.equal(consumeRateLimit("client", { limit: 2, windowMs: 1000, now: 0 }).allowed, true);
  assert.equal(consumeRateLimit("client", { limit: 2, windowMs: 1000, now: 1 }).allowed, true);
  assert.equal(consumeRateLimit("client", { limit: 2, windowMs: 1000, now: 2 }).allowed, false);
  assert.equal(consumeRateLimit("client", { limit: 2, windowMs: 1000, now: 1000 }).allowed, true);
});

test("uses the first forwarded client address", () => {
  const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } });
  assert.equal(clientAddress(request), "203.0.113.10");
});
