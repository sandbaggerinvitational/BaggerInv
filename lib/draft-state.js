const clean = (value) => String(value ?? "").trim();

export function deriveDraftState({
  draftDate,
  draftedCount,
  totalDraftPicks,
}) {
  if (!clean(draftDate)) return "unscheduled";
  if (totalDraftPicks > 0 && draftedCount >= totalDraftPicks) return "complete";
  if (draftedCount > 0) return "live";
  return "scheduled";
}
