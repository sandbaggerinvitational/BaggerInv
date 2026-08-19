const clean = (value) => String(value ?? "").trim();

export function guideLastRefreshedAt(status = {}) {
  return clean(
    status.lastSuccess?.completed_at ||
    status.lastSuccess?.completedAt ||
    status.current?.last_verified_at ||
    status.current?.lastVerifiedAt ||
    status.current?.published_at ||
    status.current?.publishedAt
  );
}

export function directorGuideStatusPresentation(status, { phase = "idle", loading = false, statusError = "" } = {}) {
  const lastRefreshedAt = guideLastRefreshedAt(status || {});
  if (phase === "refreshing") return { label: "Refreshing…", tone: "working", lastRefreshedAt };
  if (phase === "failure") return { label: "Refresh failed", tone: "error", lastRefreshedAt };

  const state = clean(status?.state).toUpperCase();
  if (state === "CURRENT") return { label: "Participant Guide verified", tone: "ready", lastRefreshedAt };
  if (state === "STALE") return { label: "Refresh recommended", tone: "attention", lastRefreshedAt };
  if (state === "FAILED_REFRESH") return { label: "Refresh failed", tone: "error", lastRefreshedAt };
  if (state === "SYNCING") return { label: "Refreshing…", tone: "working", lastRefreshedAt };
  if (state === "UNPUBLISHED") return { label: "Refresh required", tone: "attention", lastRefreshedAt };
  if (loading) return { label: "Checking refresh status…", tone: "working", lastRefreshedAt };
  if (statusError) return { label: "Status unavailable", tone: "error", lastRefreshedAt };
  return { label: "Refresh status unavailable", tone: "neutral", lastRefreshedAt };
}
