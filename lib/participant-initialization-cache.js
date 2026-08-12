const CACHE_KEY = "sbi-participant-initialization";
const SHELL_KEY = "sbi-participant-shell";
const CACHE_TTL_MS = 60_000;
const CACHE_VERSION = 2;

export function readParticipantInitializationCache(now = Date.now()) {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
    const shell = JSON.parse(window.localStorage.getItem(SHELL_KEY) || "null");
    if (cached?.version !== CACHE_VERSION || !cached?.payload?.player?.id || !shell?.id || cached.payload.player.id !== shell.id || cached.expiresAt <= now) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.payload;
  } catch {
    window.sessionStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function writeParticipantInitializationCache(payload, now = Date.now()) {
  if (typeof window === "undefined" || !payload?.player?.id) return;
  window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, payload, expiresAt: now + CACHE_TTL_MS }));
}

export function clearParticipantInitializationCache() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(CACHE_KEY);
}

export const participantInitializationCacheTtlMs = CACHE_TTL_MS;
export const participantInitializationCacheVersion = CACHE_VERSION;
