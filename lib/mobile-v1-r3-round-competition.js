import { roundCompetitionRows } from "./mobile-leaderboards.js";
import { MOBILE_LEADERS_LIMITS, requireLeadersValue } from "./mobile-v1-leaders-intelligence.js";
import { requireOpaqueMatchID } from "./mobile-opaque-match-id.js";

const bounded = (value) => typeof value === "string" && value.length > 0 && value.length <= 500;
function nullableNumber(value) {
  if (value == null) return null;
  requireLeadersValue(typeof value === "number" && Number.isFinite(value));
  return value;
}

// Competition order/ranks remain owned by the unchanged PWA helper. This export
// only completes its field with explicitly unranked, unavailable entrants.
export function mobileR3RoundCompetition(leaders = {}, source = {}, identity = {}, performance = []) {
  requireLeadersValue(bounded(identity.tournamentId) && source.tournament?.tournament_id === identity.tournamentId &&
    leaders.tournament?.id === identity.tournamentId);
  const rounds = (leaders.rounds || []).filter((r) => Number(r.number) === 3);
  requireLeadersValue(rounds.length <= 1);
  const round = rounds[0];
  if (!round || !["SI", "SINGLES"].includes(String(round.format).trim().toUpperCase())) return null;
  const entries = (source.matches || []).filter((e) => Number(e.match?.round_number) === 3);
  requireLeadersValue(entries.length <= MOBILE_LEADERS_LIMITS.matches);
  const performances = performance.filter((p) => p.roundNumber === 3);
  const field = new Map(), seenMatches = new Set();
  // The canonical read orders Matches by round/match_sort_order/match_id.
  // Match participants are supplied by team_side/player_slot. Preserve that
  // field order, not names, scores or a new competitive tiebreaker.
  for (const entry of entries) {
    const matchId = requireOpaqueMatchID(entry.match?.match_id);
    requireLeadersValue(entry.match.tournament_id === identity.tournamentId && entry.match.format === "SI" &&
      !seenMatches.has(matchId) && entry.participants?.length === 2);
    seenMatches.add(matchId);
    for (const side of [1, 2]) {
      const members = entry.participants.filter((p) => Number(p.team_side) === side);
      requireLeadersValue(members.length === 1);
      const member = members[0], playerId = member.player_id;
      requireLeadersValue(bounded(playerId) && !field.has(playerId) && Number(member.player_slot) === 1 &&
        (!member.match_id || member.match_id === matchId) &&
        (!member.tournament_id || member.tournament_id === identity.tournamentId));
      const bindings = performances.filter((p) => p.playerId === playerId && p.matchId === matchId);
      requireLeadersValue(bindings.length === 1);
      const p = bindings[0], team = side === 1 ? leaders.tournament.teamOne : leaders.tournament.teamTwo;
      requireLeadersValue(p.format === "SI" && p.sidePlayers?.length === 1 && p.sidePlayers[0].playerId === playerId &&
        bounded(p.sidePlayers[0].displayName) && team && bounded(team.id) && bounded(team.name) &&
        p.team?.teamId === team.id && p.team.name === team.name &&
        ["upcoming", "inProgress", "final"].includes(p.status) && typeof p.official === "boolean");
      field.set(playerId, { playerId, displayName: p.sidePlayers[0].displayName, matchId,
        roundNumber: 3, displayMatchNumber: p.displayMatchNumber,
        team: { teamId: team.id, name: team.name }, fieldOrder: field.size + 1,
        status: p.status, officialFinal: p.official });
    }
  }
  requireLeadersValue(field.size === performances.length && field.size <= MOBILE_LEADERS_LIMITS.players);
  const ranked = roundCompetitionRows(leaders.scoreLeaderboard || [], 3, round.format,
    leaders.roundLeaderboards?.[3] || [], round.matches || []);
  const seen = new Set(), established = [];
  for (const row of ranked) {
    const binding = field.get(row.id);
    const matches = (round.matches || []).filter((m) => [...(m.team1Players || []), ...(m.team2Players || [])].some((p) => p.id === row.id));
    requireLeadersValue(binding && !seen.has(row.id) && row.entityType === "PLAYER" &&
      matches.length === 1 && matches[0].id === binding.matchId &&
      row.playerIds?.length === 1 && row.playerIds[0] === row.id && typeof row.officialFinal === "boolean" &&
      Number.isSafeInteger(row.displayRank) && row.displayRank > 0 && row.displayRank <= ranked.length);
    seen.add(row.id);
    const points = nullableNumber(row.points), netScore = nullableNumber(row.net);
    // Neither value available means field membership only, even if a future
    // upstream helper returns an empty row. Never promote it to tied-last.
    if (points === null && netScore === null) continue;
    // Preserve the helper's competition-final flag. It is NOT a claim that
    // the separate performance/scorecard projection is Official and complete.
    established.push({ ...binding, officialFinal: row.officialFinal, rank: row.displayRank,
      tied: ranked.filter((other) => other.displayRank === row.displayRank).length > 1,
      points, netScore, availability: "competition" });
  }
  const establishedIds = new Set(established.map((r) => r.playerId));
  const unscored = [...field.values()].filter((r) => !establishedIds.has(r.playerId)).map((r) => ({
    ...r, rank: null, tied: null, points: null, netScore: null, availability: "unscored",
  }));
  return { roundNumber: 3, format: "SI", netBasis: "MATCHUP", rows: [...established, ...unscored] };
}
