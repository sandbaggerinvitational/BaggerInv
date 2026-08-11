import { scoringAuthorityEnvironment } from "./scoring-authority.js";
import { finalizeCanonicalMatch, readCanonicalScoringAuthority, reopenCanonicalMatch, submitCanonicalHoleScore } from "./scoring-authority-supabase.js";
import { confirmLiveMatchScorecard, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "./google-sheets-write.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function canonicalAuthorization(current, matchId) {
  return {
    passport_verified: true,
    tournament_id: clean(current.tournamentId || current.year || "2026"),
    match_id: matchId,
    player_id: clean(current.playerId || `match-access:${matchId}`),
    permission_revision: Math.max(1, number(current.accessVersion, 1)),
    role: current.scope === "admin" ? "DIRECTOR" : current.playerId ? "PLAYER" : "MATCH_ACCESS",
  };
}

async function canonicalMatchContext(current, matchId) {
  const read = await readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" });
  const match = read.payload?.data;
  if (!read.payload?.ok || !match) throw new Error("The authoritative match was not found.");
  return {
    tournamentId: clean(current.tournamentId || match.tournament_id),
    matchRevision: number(match.match_revision),
    permissionRevision: Math.max(1, number(match.permission_revision, current.accessVersion || 1)),
  };
}

function participantHole(result) {
  return {
    "Hole Score ID": `${result.match_id}-H${result.hole_number}`,
    "Match ID": result.match_id,
    "Hole Number": result.hole_number,
    "Team 1 Gross Scores": result.gross?.team_1,
    "Team 2 Gross Scores": result.gross?.team_2,
    "Team 1 Net Score": result.net?.team_1,
    "Team 2 Net Score": result.net?.team_2,
    "Hole Winner": result.hole_winner,
    Revision: result.hole_revision,
    "Updated At": result.updated_at,
    "Updated By": "Authorized participant",
  };
}

export async function persistParticipantScore({ matchId, input, current, updatedBy }) {
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved === "google") {
    const measured = await withWorkbookWriteDiagnostics("participant-score", () => input.action === "confirm"
      ? confirmLiveMatchScorecard(matchId, updatedBy)
      : saveLiveHoleScore(matchId, input, updatedBy));
    return { authority: "google", result: measured.result, diagnostics: measured.diagnostics };
  }
  const context = await canonicalMatchContext(current, matchId);
  const authoritativeCurrent = { ...current, tournamentId: context.tournamentId, accessVersion: context.permissionRevision };
  if (input.action === "confirm") {
    const response = await finalizeCanonicalMatch({
      match_id: matchId,
      mutation_key: input.clientMutationId || `finalize:${matchId}:${Date.now()}`,
      expected_match_revision: input.expectedMatchRevision == null ? context.matchRevision : number(input.expectedMatchRevision, -1),
      authorization: canonicalAuthorization(authoritativeCurrent, matchId),
    });
    if (!response.payload?.ok) throw canonicalPersistenceError(response.payload);
    return { authority: "supabase", result: {
      "Match ID": matchId, "Match Status": "Final", "Finalized At": response.payload.updated_at,
      updatedAt: response.payload.updated_at, matchRevision: response.payload.match_revision,
      matchComplete: true, resultWinner: response.payload.result_winner,
    }, diagnostics: { supabaseAuthoritativeMs: response.durationMs } };
  }
  const response = await submitCanonicalHoleScore({
    match_id: matchId,
    hole_number: input.holeNumber,
    team_1_gross_scores: input.team1GrossScores,
    team_2_gross_scores: input.team2GrossScores,
    expected_match_revision: input.expectedMatchRevision ?? context.matchRevision,
    expected_match_updated_at: input.expectedUpdatedAt,
    expected_hole_revision: input.expectedRevision,
    mutation_key: input.clientMutationId,
    authorization: canonicalAuthorization(authoritativeCurrent, matchId),
  });
  if (!response.payload?.ok) throw canonicalPersistenceError(response.payload);
  return { authority: "supabase", result: {
    hole: participantHole(response.payload),
    liveStatus: {
      currentHole: response.payload.match?.current_hole,
      holesRemaining: response.payload.match?.holes_remaining,
      team1HolesWon: response.payload.match?.team_1_holes_won,
      team2HolesWon: response.payload.match?.team_2_holes_won,
      statusText: response.payload.match?.running_result,
      complete: response.payload.match?.clinched,
      winner: response.payload.match?.result_winner,
    },
    points: {
      frontWinner: response.payload.match?.front_winner,
      backWinner: response.payload.match?.back_winner,
      overallWinner: response.payload.match?.overall_winner,
      team1Points: response.payload.match?.team_1_points,
      team2Points: response.payload.match?.team_2_points,
    },
    matchComplete: Boolean(response.payload.match?.scorecard_complete),
    updatedAt: response.payload.updated_at,
    matchRevision: response.payload.match_revision,
    updatedBy,
  }, diagnostics: { supabaseAuthoritativeMs: response.durationMs, postgresTimings: response.payload.timings } };
}

export function canonicalPersistenceError(payload = {}) {
  const message = ({
    MATCH_REVISION_CONFLICT: "This match was updated by someone else. Refresh before saving again.",
    HOLE_REVISION_CONFLICT: "This hole was updated by someone else. Refresh before saving again.",
    IDEMPOTENCY_CONFLICT: "This score mutation conflicts with a previous request.",
    SCORING_LOCKED: "Scoring has been locked by the Tournament Director.",
    MATCH_FINAL: "This scorecard is already finalized.",
    SCORECARD_INCOMPLETE: "All 18 holes must be confirmed before final submission.",
    UNRESOLVED_MUTATIONS: "Resolve pending score issues before final submission.",
    SCORING_INGRESS_PAUSED: "Scoring is briefly paused for a verified authority transition.",
    SUPABASE_NOT_AUTHORITY: "Supabase scoring authority is not active.",
  })[payload.code] || "The authoritative score transaction could not be completed.";
  const error = new Error(message);
  error.code = payload.code;
  error.status = /CONFLICT/.test(payload.code || "") ? 409 : /UNAUTHORIZED/.test(payload.code || "") ? 403 : 400;
  error.authoritativeDiagnostics = payload;
  return error;
}

export async function persistDirectorMatchLifecycle({ action, matchId, updatedBy }) {
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved === "google") return { authority: "google", delegated: false };
  const read = await readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" });
  const match = read.payload?.data;
  if (!match) throw new Error("The authoritative match was not found.");
  const input = {
    match_id: matchId,
    mutation_key: `director:${action}:${matchId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    expected_match_revision: number(match.match_revision),
    authorization: {
      passport_verified: true,
      tournament_id: match.tournament_id,
      match_id: matchId,
      player_id: clean(updatedBy || "Tournament Director"),
      permission_revision: number(match.permission_revision, 1),
      role: "DIRECTOR",
    },
  };
  const response = action === "finalize"
    ? await finalizeCanonicalMatch(input)
    : action === "reopen"
      ? await reopenCanonicalMatch(input)
      : null;
  if (!response) return { authority: "supabase", delegated: false };
  if (!response.payload?.ok) throw canonicalPersistenceError(response.payload);
  return { authority: "supabase", delegated: true, result: response.payload };
}
