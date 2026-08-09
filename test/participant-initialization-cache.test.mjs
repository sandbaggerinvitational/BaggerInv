import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant navigation reuses a short-lived identity-scoped snapshot while refreshing", async () => {
  const [cache, score, home] = await Promise.all([
    source("lib/participant-initialization-cache.js"),
    source("app/score/ScoreEntry.js"),
    source("app/PersonalizedPlayerHome.js"),
  ]);
  assert.match(cache, /sessionStorage/);
  assert.match(cache, /cached\.payload\.player\.id !== shell\.id/);
  assert.match(cache, /CACHE_TTL_MS = 60_000/);
  assert.match(score, /readParticipantInitializationCache\(\)/);
  assert.match(score, /writeParticipantInitializationCache\(identity\)/);
  assert.match(score, /setPassportState\(cached \? "freshness-degraded" : "unavailable"\)/);
  assert.match(home, /cachedInitialization \? "ready" : "loading"/);
  assert.match(home, /writeParticipantInitializationCache\(result\)/);
});
