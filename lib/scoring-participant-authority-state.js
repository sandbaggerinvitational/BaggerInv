const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function participantHoleFromCanonical(row = {}) {
  return {
    "Hole Score ID": `${clean(row.match_id)}-H${number(row.hole_number)}`,
    "Match ID": clean(row.match_id),
    "Hole Number": number(row.hole_number),
    "Team 1 Gross Scores": row.team_1_gross_scores,
    "Team 2 Gross Scores": row.team_2_gross_scores,
    "Team 1 Net Score": number(row.team_1_net_score),
    "Team 2 Net Score": number(row.team_2_net_score),
    "Hole Winner": clean(row.hole_winner),
    Revision: number(row.hole_revision),
    "Updated At": clean(row.updated_at),
    "Updated By": clean(row.actor_id || "Authorized participant"),
  };
}

export function mergeParticipantScoringAuthorityState(googleData = {}, canonicalScorecard = {}, {
  authorizationVerified = false,
} = {}) {
  const canonicalMatch = canonicalScorecard?.match || {};
  const canonicalHoles = Array.isArray(canonicalScorecard?.holes) ? canonicalScorecard.holes : [];
  const matchRevision = number(canonicalMatch.match_revision);
  const status = clean(canonicalMatch.status || "LIVE").toUpperCase();
  const scoringLocked = Boolean(canonicalMatch.scoring_locked);
  const writable = Boolean(authorizationVerified && status !== "FINAL" && !scoringLocked);
  const holeScores = canonicalHoles.map(participantHoleFromCanonical);
  return {
    ...googleData,
    match: {
      ...(googleData.match || {}),
      "Match Status": status === "FINAL" ? "Final" : status === "UPCOMING" ? "Upcoming" : "Live",
      "Scoring Locked": scoringLocked,
      "Current Hole": number(canonicalMatch.current_hole),
      "Team 1 Holes Won": number(canonicalMatch.team_1_holes_won),
      "Team 2 Holes Won": number(canonicalMatch.team_2_holes_won),
      "Holes Remaining": number(canonicalMatch.holes_remaining, 18),
      "Match Status Text": clean(canonicalMatch.running_result),
      "Updated At": clean(canonicalMatch.authority_updated_at || canonicalMatch.updated_at),
      Revision: matchRevision,
      matchRevision,
    },
    holeScores,
    canConfirm: Boolean(canonicalMatch.scorecard_complete) && status !== "FINAL",
    authority: {
      source: "supabase",
      authorizationVerified: Boolean(authorizationVerified),
      writable,
      matchRevision,
      permissionRevision: number(canonicalMatch.permission_revision, 1),
      status,
      scoringLocked,
      scorecardComplete: Boolean(canonicalMatch.scorecard_complete),
    },
  };
}
