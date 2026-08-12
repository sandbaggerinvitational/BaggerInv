import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  participantInitializationCacheVersion,
  readParticipantInitializationCache,
  writeParticipantInitializationCache,
} from "../lib/participant-initialization-cache.js";

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
  assert.match(cache, /cached\?\.version !== CACHE_VERSION/);
  assert.match(score, /readParticipantInitializationCache\(\)/);
  assert.match(score, /writeParticipantInitializationCache\(identity\)/);
  assert.match(score, /setPassportState\(cached \? "freshness-degraded" : "unavailable"\)/);
  assert.match(home, /cachedInitialization \? "ready" : "loading"/);
  assert.match(home, /writeParticipantInitializationCache\(result\)/);
});

test("participant context cache invalidates pre-fix tournament payloads deterministically", () => {
  const previousWindow = globalThis.window;
  const session = new Map();
  const local = new Map([["sbi-participant-shell", JSON.stringify({ id: "CB01", name: "Clay Beltran" })]]);
  const storage = (map) => ({
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  });
  globalThis.window = { sessionStorage: storage(session), localStorage: storage(local) };
  try {
    session.set("sbi-participant-initialization", JSON.stringify({
      payload: { player: { id: "CB01" }, data: { tournament: { id: "2026-PHASE2-REHEARSAL", year: 3026 } } },
      expiresAt: 61_000,
    }));
    assert.equal(readParticipantInitializationCache(1_000), null);
    assert.equal(session.has("sbi-participant-initialization"), false);

    const canonical = { player: { id: "CB01" }, data: { tournament: { id: "2026", year: 2026 } } };
    writeParticipantInitializationCache(canonical, 1_000);
    assert.equal(JSON.parse(session.get("sbi-participant-initialization")).version, participantInitializationCacheVersion);
    assert.deepEqual(readParticipantInitializationCache(1_001), canonical);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
