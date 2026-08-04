const clean = (value) => String(value ?? "").trim();

export const PREVIEW_RESET_RESULT_FIELDS = [
  "Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner",
  "Team 1 Points", "Team 2 Points", "Final Result", "Winner", "Overall Result",
  "Match Result", "Match Status Text", "Notes", "Completed At", "Finalized At", "Finalized By",
];

export const PREVIEW_RESET_PROGRESS_FIELDS = [
  "Current Hole", "Team 1 Holes Won", "Team 2 Holes Won", "Holes Remaining",
];

export const PREVIEW_RESET_ACCESS_FIELDS = [
  "Access Code Hash", "Access Token Hash", "Access Selector", "Access Expires At",
];

export function recordInPreviewTournament(record = {}, { tournamentId = "", year } = {}) {
  const recordTournamentId = clean(record["Tournament ID"]);
  if (recordTournamentId && tournamentId) return recordTournamentId === clean(tournamentId);
  return Number(record.Year) === Number(year);
}

export function resetPreviewMatchRecord(record = {}, updatedAt = new Date().toISOString()) {
  const next = { ...record };
  for (const field of [...PREVIEW_RESET_RESULT_FIELDS, ...PREVIEW_RESET_PROGRESS_FIELDS, ...PREVIEW_RESET_ACCESS_FIELDS]) {
    if (Object.hasOwn(next, field)) next[field] = "";
  }
  if (Object.hasOwn(next, "Match Status")) {
    next["Match Status"] = clean(record["Match Status"]).toLowerCase() === "ghost match" ? "Ghost Match" : "Scheduled";
  }
  if (Object.hasOwn(next, "Access Active")) next["Access Active"] = "FALSE";
  if (Object.hasOwn(next, "Access Version")) next["Access Version"] = String((Number(record["Access Version"]) || 0) + 1);
  if (Object.hasOwn(next, "Updated At")) next["Updated At"] = updatedAt;
  if (Object.hasOwn(next, "Updated By")) next["Updated By"] = "Preview Tournament Reset";
  return next;
}

export function resetPreviewTournamentRows(records = [], scope = {}, { resetMatches = false } = {}) {
  return records.flatMap((record) => {
    if (!recordInPreviewTournament(record, scope)) return [record];
    return resetMatches ? [resetPreviewMatchRecord(record)] : [];
  });
}

export const PREVIEW_RESET_PRESERVES = [
  "Players", "Teams", "Pairings", "Courses", "Schedule", "Dining", "Rules",
  "Local Guide", "Important Contacts", "Tournament configuration", "Workbook structure",
];

export const PREVIEW_RESET_DERIVED = [
  "Leaderboard standings", "Team standings", "Momentum", "Championship Projections",
  "Projection History", "Storylines", "Tournament Intelligence",
];
