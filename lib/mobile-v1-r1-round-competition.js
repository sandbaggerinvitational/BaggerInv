import { roundCompetitionRows } from "./mobile-leaderboards.js";
import { MOBILE_LEADERS_LIMITS, requireLeadersValue } from "./mobile-v1-leaders-intelligence.js";

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  requireLeadersValue(typeof value === "number" && Number.isFinite(value));
  return value;
}

// An allowlisted export, not another ranking implementation. The unchanged PWA
// helper owns eligibility, official Points, ordering, missing Net and ranks.
// This prerequisite intentionally enables only Round 1 Best Ball.
export function mobileR1RoundCompetition(leaders = {}, source = {}, identity = {}) {
  requireLeadersValue(typeof identity.tournamentId === "string" && identity.tournamentId &&
    source.tournament?.tournament_id === identity.tournamentId && leaders.tournament?.id === identity.tournamentId);
  const rounds = (leaders.rounds || []).filter((round) => Number(round.number) === 1);
  requireLeadersValue(rounds.length <= 1);
  const round = rounds[0];
  if (!round || !["BB", "BEST BALL"].includes(String(round.format).trim().toUpperCase())) return null;
  const entries = (source.matches || []).filter((entry) => Number(entry.match?.round_number) === 1);
  requireLeadersValue(entries.length <= MOBILE_LEADERS_LIMITS.matches);
  const participants = new Set();
  for (const entry of entries) {
    requireLeadersValue(entry.match.tournament_id === identity.tournamentId);
    for (const participant of entry.participants || []) {
      requireLeadersValue(!participant.tournament_id || participant.tournament_id === identity.tournamentId);
      participants.add(participant.player_id);
    }
  }
  const ranked = roundCompetitionRows(leaders.scoreLeaderboard || [], round.number, round.format,
    leaders.roundLeaderboards?.[round.number] || [], round.matches || []);
  requireLeadersValue(ranked.length <= MOBILE_LEADERS_LIMITS.players);
  const seen = new Set();
  const rows = ranked.map((row) => {
    requireLeadersValue(typeof row.id === "string" && row.id.length > 0 && row.id.length <= 500 &&
      participants.has(row.id) && !seen.has(row.id));
    seen.add(row.id);
    requireLeadersValue(Number.isSafeInteger(row.displayRank) && row.displayRank >= 1 && row.displayRank <= ranked.length);
    requireLeadersValue(typeof row.officialFinal === "boolean");
    return {
      playerId: row.id,
      rank: row.displayRank,
      // Merely label ranks already shared by the helper; do not re-rank ties.
      tied: ranked.filter((other) => other.displayRank === row.displayRank).length > 1,
      points: nullableNumber(row.points),
      netScore: nullableNumber(row.net),
      officialFinal: row.officialFinal,
    };
  });
  return { roundNumber: 1, format: "BB", rows };
}
