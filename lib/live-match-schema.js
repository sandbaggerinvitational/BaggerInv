export const LIVE_MATCH_CORE_SCORE_HEADERS = Object.freeze([
  "Match ID",
  "Match Status",
  "Updated At",
  "Updated By",
]);

// These runtime progress fields were introduced by the application after the
// original Live Matches workbook schema. They are optional so copied and
// historical workbooks remain valid. The scoring model can derive the same
// progress from Live Hole Scores when a workbook does not persist them.
export const LIVE_MATCH_OPTIONAL_PROGRESS_HEADERS = Object.freeze([
  "Current Hole",
  "Team 1 Holes Won",
  "Team 2 Holes Won",
  "Holes Remaining",
  "Match Status Text",
]);

export function existingLiveMatchProgressUpdates(headers, updates) {
  const available = new Set(headers || []);
  const optional = new Set(LIVE_MATCH_OPTIONAL_PROGRESS_HEADERS);
  return Object.fromEntries(Object.entries(updates || {}).filter(([field]) =>
    !optional.has(field) || available.has(field)
  ));
}
