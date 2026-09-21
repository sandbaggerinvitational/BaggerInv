import { buildLeaderboard } from "./leaderboards-core-engine.js";
import { leaderboardsCoreDataFromSupabaseView } from "./leaderboards-core-supabase.js";
import { segmentMatchResult } from "./game-center-display.js";
import { isOfficialMatchResult } from "./live-tournament.js";
import { requireOpaqueMatchID } from "./mobile-opaque-match-id.js";
import { MOBILE_LEADERS_LIMITS, requireLeadersValue } from "./mobile-v1-leaders-intelligence.js";
import { mobileRoundScorecard } from "./mobile-v1-round-scorecard.js";

const clean = (value) => String(value ?? "").trim();
const numberOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const labels = { won: "Won", lost: "Lost", halved: "Halved", leading: "Leading", trailing: "Trailing", allSquare: "All Square", pending: "Pending", unavailable: "Unavailable" };
const segments = [["front", "Front", 1, 9], ["back", "Back", 10, 18], ["overall", "Overall", 1, 18]];

function segmentResults(match, format, side, teams, official, status) {
  // Reuse the existing PWA segment display helper; no new golf formula.
  // Stable side labels avoid ambiguous team-name matching. Singles Front/Back
  // are descriptive only: calculateMatchPoints intentionally awards neither.
  const visible = official || status === "inProgress";
  const holes = visible ? (match.holeResults || []).map((hole) => ({ number: hole.holeNumber, winner: hole.winner })) : [];
  return segments.map(([id, label, start, end]) => {
    const displayed = segmentMatchResult(holes, start, end, { 1: "Team 1", 2: "Team 2" });
    const descriptiveOnly = format === "SI" && id !== "overall";
    const supplied = id === "overall" ? match.matchupWinner || match.overallWinner : match[`${id}Winner`];
    const completed = descriptiveOnly ? official && displayed.recorded === 9 : official;
    const result = completed && !descriptiveOnly ? supplied : displayed.team || (displayed.recorded ? "Halved" : "");
    const winnerSide = result === "Team 1" ? 1 : result === "Team 2" ? 2 : null;
    let state;
    if (!displayed.recorded) state = official ? "unavailable" : "pending";
    else if (official && (!completed || !["Team 1", "Team 2", "Halved"].includes(result))) state = "unavailable";
    else if (winnerSide) state = completed ? winnerSide === side ? "won" : "lost" : winnerSide === side ? "leading" : "trailing";
    else state = completed ? "halved" : "allSquare";
    const available = !["pending", "unavailable"].includes(state);
    return { id, label, state, display: labels[state], descriptiveOnly,
      official: completed && available,
      winnerTeamId: available && winnerSide ? teams[winnerSide].teamId : null };
  });
}

function completedScores(scoreLeaderboard, playerId, sideIds, format, official) {
  const scope = format === "SC" ? "team" : "player";
  const absent = (state) => ({ scope, state, grossScore: null, netScore: null });
  if (!official) return absent("pending");
  const rows = scoreLeaderboard.filter((row) => format === "SC"
    ? row.entityType === "PAIRING" && row.playerIds.length === sideIds.length && sideIds.every((id) => row.playerIds.includes(id))
    : row.entityType === "PLAYER" && row.id === playerId);
  requireLeadersValue(rows.length <= 1);
  const row = rows[0];
  if (!row) return absent("unavailable");
  // Completion/presence checks only. Never sum holes or repair a score here.
  const holes = row.scorecard || [];
  if (row.holes !== 18 || holes.length !== 18 || new Set(holes.map((hole) => hole.hole)).size !== 18 ||
      holes.some((hole) => !Number.isInteger(hole.hole) || hole.hole < 1 || hole.hole > 18)) return absent("incomplete");
  const grossScore = numberOrNull(row.gross), netScore = numberOrNull(row.net);
  if (grossScore === null || netScore === null) return absent("unavailable");
  return { scope, state: "completed", grossScore, netScore };
}

export function mobilePlayerRoundPerformance(leaders = {}, source = {}, identity = {}) {
  requireLeadersValue(clean(source.tournament?.tournament_id) === clean(identity.tournamentId));
  const entries = source.matches || [], rounds = leaders.rounds || [];
  requireLeadersValue(entries.length <= MOBILE_LEADERS_LIMITS.matches && rounds.length <= MOBILE_LEADERS_LIMITS.rounds);
  const teams = Object.fromEntries([1, 2].map((side) => {
    const team = side === 1 ? leaders.tournament?.teamOne : leaders.tournament?.teamTwo;
    requireLeadersValue(clean(team?.id) && clean(team?.name));
    return [side, { teamId: clean(team.id), name: clean(team.name) }];
  }));
  requireLeadersValue(teams[1].teamId !== teams[2].teamId);
  const seen = new Set();
  const result = entries.flatMap((entry) => {
    const matchId = requireOpaqueMatchID(entry.match?.match_id);
    requireLeadersValue(!seen.has(matchId)); seen.add(matchId);
    requireLeadersValue(clean(entry.match.tournament_id) === clean(identity.tournamentId));
    const roundNumber = Number(entry.match.round_number), format = clean(entry.match.format).toUpperCase();
    requireLeadersValue(Number.isSafeInteger(roundNumber) && roundNumber > 0 && ["BB", "SC", "SI"].includes(format));
    const round = rounds.find((item) => Number(item.number) === roundNumber);
    const matches = (round?.matches || []).filter((item) => item.id === matchId);
    requireLeadersValue(matches.length === 1);
    const match = matches[0];
    const participants = entry.participants || [];
    requireLeadersValue(participants.length >= 2 && participants.length <= 4 &&
      new Set(participants.map((p) => clean(p.player_id))).size === participants.length);
    const sides = {};
    for (const side of [1, 2]) {
      const supplied = participants.filter((p) => Number(p.team_side) === side).sort((a, b) => Number(a.player_slot) - Number(b.player_slot));
      requireLeadersValue(supplied.length >= 1 && supplied.length <= (format === "SI" ? 1 : 2));
      sides[side] = supplied.map((p, index) => {
        requireLeadersValue(clean(p.player_id) && Number(p.player_slot) === index + 1 &&
          (!p.match_id || p.match_id === matchId) && (!p.tournament_id || clean(p.tournament_id) === clean(identity.tournamentId)));
        return { playerId: clean(p.player_id), displayName: clean(p.display_name || p.player_id), slot: index + 1 };
      });
      requireLeadersValue(JSON.stringify(sides[side].map((p) => p.playerId)) ===
        JSON.stringify((match[`team${side}Players`] || []).map((p) => clean(p.id))));
    }
    requireLeadersValue(sides[1].length + sides[2].length === participants.length);
    const sourceStatus = clean(entry.match.status ?? match.status).toLowerCase();
    const official = ["final", "finalized"].includes(sourceStatus) && isOfficialMatchResult(match);
    const status = official ? "final" : ["live", "open", "reopened", "in progress", "in-progress"].includes(sourceStatus) ? "inProgress" : "upcoming";
    // Existing PWA attribution determines each player's Match points, including
    // partner shares. No division, point calculation or Round aggregation here.
    const points = buildLeaderboard([match], {}, { 1: teams[1], 2: teams[2] });
    // The unchanged engine runs on ONE exact source Match, once for both sides.
    // Its legacy Round/entity grouping cannot merge another Match for a player.
    const single = leaderboardsCoreDataFromSupabaseView({ ...source, matches: [entry] });
    requireLeadersValue(single.slotVerification.pass);
    return [1, 2].flatMap((side) => sides[side].map((player) => {
      const opposite = side === 1 ? 2 : 1;
      const pointRow = points.find((row) => row.id === player.playerId);
      requireLeadersValue(pointRow && numberOrNull(pointRow.points) !== null);
      const performance = { playerId: player.playerId, roundNumber, format, matchId,
        displayMatchNumber: clean(entry.presentation?.display_match_number) || null,
        status, official, team: teams[side], opponent: teams[opposite],
        sidePlayers: sides[side], opponents: sides[opposite],
        partner: format === "SC" ? sides[side].find((p) => p.playerId !== player.playerId) || null : null,
        segments: segmentResults(match, format, side, teams, official, status),
        pointsEarned: official ? pointRow.points : null,
        scores: completedScores(single?.scoreLeaderboard || [], player.playerId, sides[side].map((p) => p.playerId), format, official) };
      return { ...performance, scorecard: mobileRoundScorecard(entry, performance, single,
        source.tournament_presentation?.presentation?.tournamentMatchDisplay?.[matchId] ?? {}) };
    }));
  });
  requireLeadersValue(result.length <= MOBILE_LEADERS_LIMITS.matches * 4);
  return result;
}
