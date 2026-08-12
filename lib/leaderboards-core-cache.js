"use client";

const CACHE_KEY = "sbi-leaderboards-core";
const SHELL_KEY = "sbi-participant-shell";
const CACHE_VERSION = 1;

export function readLeaderboardsCoreCache() {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
    const shell = JSON.parse(window.localStorage.getItem(SHELL_KEY) || "null");
    if (cached?.version !== CACHE_VERSION || !cached?.payload?.data?.tournament?.id ||
        !cached?.payload?.data?.sourceFingerprint || !cached?.payload?.player?.id ||
        !shell?.id || shell.id !== cached.payload.player.id) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.payload;
  } catch {
    window.sessionStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function writeLeaderboardsCoreCache(payload) {
  if (typeof window === "undefined" || !payload?.data?.tournament?.id ||
      !payload?.data?.sourceFingerprint || !payload?.player?.id) return;
  window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, payload }));
}

export function clearLeaderboardsCoreCache() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(CACHE_KEY);
}

export const leaderboardsCoreCacheVersion = CACHE_VERSION;
