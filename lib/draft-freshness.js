const clean = (value) => String(value ?? "").trim();

export function draftProjectionFreshness({ storedDrafts = [], sourceProjection = null, sourceError = null } = {}) {
  if (!storedDrafts.length) return { status: "UNAVAILABLE", reason: "NO_CERTIFIED_DRAFT_PROJECTION" };
  if (sourceError || !sourceProjection) return {
    status: "UNKNOWN",
    reason: sourceError ? "GOOGLE_SOURCE_UNAVAILABLE" : "SOURCE_NOT_CHECKED",
  };
  const stored = new Map(storedDrafts.map((draft) => [Number(draft.tournament_year), clean(draft.source_fingerprint)]));
  const differences = sourceProjection.drafts.flatMap((draft) => {
    const actual = stored.get(Number(draft.tournament_year));
    return actual === draft.source_fingerprint ? [] : [{
      year: Number(draft.tournament_year),
      sourceFingerprint: draft.source_fingerprint,
      storedFingerprint: actual || null,
    }];
  });
  return differences.length
    ? { status: "STALE", reason: "GOOGLE_SOURCE_FINGERPRINT_CHANGED", differences }
    : { status: "CURRENT", reason: "SOURCE_FINGERPRINT_MATCH" };
}
