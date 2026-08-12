"use client";

const CACHE_KEY = "sbi-tournament-live";
const CACHE_VERSION = 1;

export function readTournamentLiveCache() {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
    if (cached?.version !== CACHE_VERSION || !cached?.payload?.tournament?.id || !cached?.payload?.revision) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.payload;
  } catch {
    window.sessionStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function writeTournamentLiveCache(payload) {
  if (typeof window === "undefined" || !payload?.tournament?.id || !payload?.revision) return;
  window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, payload }));
}

export function clearTournamentLiveCache() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(CACHE_KEY);
}

export const tournamentLiveCacheVersion = CACHE_VERSION;
