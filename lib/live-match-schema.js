export const LIVE_MATCH_CORE_SCORE_HEADERS = Object.freeze([
  "Match ID",
  "Match Status",
  "Updated At",
  "Updated By",
]);

// Canonical Phase 2 lifecycle placement. The Preview workbook migration inserts
// this field immediately after Match Status so lifecycle state stays together;
// existing columns are shifted intact rather than rewritten.
export const LIVE_MATCH_SCORING_LOCK_SCHEMA = Object.freeze({
  header: "Scoring Locked",
  after: "Match Status",
  before: "Notes",
  sourceColumnCount: 45,
  targetColumnCount: 46,
});

export function liveMatchScoringLockColumnIndex(headers = []) {
  const existing = headers.indexOf(LIVE_MATCH_SCORING_LOCK_SCHEMA.header);
  if (existing >= 0) return existing;
  const anchor = headers.indexOf(LIVE_MATCH_SCORING_LOCK_SCHEMA.after);
  if (anchor < 0) throw new Error("Live Matches is missing the Match Status lifecycle anchor.");
  return anchor + 1;
}

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
