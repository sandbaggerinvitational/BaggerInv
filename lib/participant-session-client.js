let pendingPlayerPassportSession = null;

/**
 * Coalesce only simultaneous participant-shell reads. The promise is cleared
 * as soon as it settles, so focus and identity-change revalidation stay fresh.
 */
export function readFreshPlayerPassportSession() {
  if (!pendingPlayerPassportSession) {
    pendingPlayerPassportSession = fetch("/api/player-passport/session", {
      cache: "no-store",
      credentials: "same-origin",
    }).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      payload: await response.json().catch(() => ({})),
    })).finally(() => {
      pendingPlayerPassportSession = null;
    });
  }
  return pendingPlayerPassportSession;
}
