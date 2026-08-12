"use client";

const CACHE_KEY = "sbi-participant-home";
const SHELL_KEY = "sbi-participant-shell";
const CACHE_VERSION = 1;

export function readParticipantHomeCache() {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
    const shell = JSON.parse(window.localStorage.getItem(SHELL_KEY) || "null");
    if (cached?.version !== CACHE_VERSION || !cached?.payload?.player?.id ||
        !shell?.id || cached.payload.player.id !== shell.id) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.payload;
  } catch {
    window.sessionStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function writeParticipantHomeCache(payload) {
  if (typeof window === "undefined" || !payload?.player?.id || !payload?.revision) return;
  window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, payload }));
}

export function clearParticipantHomeCache() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(CACHE_KEY);
}

export const participantHomeCacheVersion = CACHE_VERSION;
