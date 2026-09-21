import { MobileApiError } from "./mobile-api-v1.js";
import { PLAYER_METRICS, playerPerformanceRows, rankPlayerRows } from "./mobile-leaderboards.js";
import { requireOpaqueMatchID } from "./mobile-opaque-match-id.js";

export const MOBILE_LEADERS_LIMITS = Object.freeze({ rounds: 12, players: 256, matches: 64, responseBytes: 2_097_152 });
const text = (value) => String(value ?? "").trim();
const nullableText = (value) => text(value) || null;
const formats = Object.freeze({ BB: "Best Ball", SC: "Scramble", SI: "Singles" });
export function requireLeadersValue(value) {
  if (!value) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
}
export function requireLeadersBounds(body) {
  requireLeadersValue(Buffer.byteLength(JSON.stringify(body), "utf8") <= MOBILE_LEADERS_LIMITS.responseBytes);
}
function finite(value, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  requireLeadersValue(typeof value === "number" && Number.isFinite(value));
  return value;
}
function count(value) {
  requireLeadersValue(Number.isSafeInteger(value) && value >= 0);
  return value;
}

// Canonical Round/Match-time presentation supplied by the existing server
// adapter. No editorial label parsing, calendar mapping, or course guessing.
export function leadersRoundContext(round = {}) {
  const value = text(round.format);
  const format = Object.keys(formats).find((key) => key === value.toUpperCase() || formats[key].toUpperCase() === value.toUpperCase()) || null;
  return {
    format,
    formatDisplayName: format ? formats[format] : nullableText(value),
    course: {
      courseId: nullableText(round.course?.id),
      name: nullableText(round.course?.name),
      tee: nullableText(round.course?.tee),
    },
  };
}

export function mobilePlayerIntelligence(leaders = {}, source = {}, identity = {}) {
  requireLeadersValue(text(source.tournament?.tournament_id) === text(identity.tournamentId));
  const rounds = leaders.rounds || [];
  const entries = source.matches || [];
  requireLeadersValue(rounds.length <= MOBILE_LEADERS_LIMITS.rounds && entries.length <= MOBILE_LEADERS_LIMITS.matches &&
    (leaders.leaderboard || []).length <= MOBILE_LEADERS_LIMITS.players);
  const matchReferences = entries.map((entry) => {
    requireLeadersValue(!entry.match?.tournament_id || text(entry.match.tournament_id) === text(identity.tournamentId));
    const matchId = requireOpaqueMatchID(entry.match?.match_id);
    requireLeadersValue(Number.isSafeInteger(Number(entry.match.round_number)) && Number(entry.match.round_number) >= 1);
    const participantIds = (entry.participants || []).map((participant) => text(participant.player_id));
    requireLeadersValue(participantIds.length > 0 && participantIds.length <= 4 && participantIds.every(Boolean) && new Set(participantIds).size === participantIds.length);
    return {
      matchId,
      roundNumber: count(Number(entry.match.round_number)),
      displayMatchNumber: nullableText(entry.presentation?.display_match_number),
      participantIds,
    };
  });
  requireLeadersValue(new Set(matchReferences.map((row) => row.matchId)).size === matchReferences.length);
  const scope = (rows, selectedRounds) => {
    // These are the exact existing PWA formulas and tiebreaker, executed here
    // on the server. Scramble/incomplete/unofficial rounds remain excluded
    // from individual averages by playerPerformanceRows itself.
    const performance = playerPerformanceRows(rows, leaders.scoreLeaderboard || [], selectedRounds);
    requireLeadersValue(performance.length <= MOBILE_LEADERS_LIMITS.players);
    const selectedNumbers = new Set(selectedRounds.map((round) => Number(round.number)));
    const players = performance.map((row) => ({
      playerId: text(row.id), displayName: text(row.player),
      team: { teamId: text(row.teamSide === 1 ? leaders.tournament?.teamOne?.id : leaders.tournament?.teamTwo?.id), name: text(row.team) },
      points: finite(row.points), wins: count(row.wins), losses: count(row.losses), halves: count(row.halves),
      matchesPlayed: count(row.matchesPlayed), record: text(row.record),
      winPct: finite(row.winPct, true), grossAvg: finite(row.grossAvg, true), netAvg: finite(row.netAvg, true),
      matchIds: matchReferences.filter((match) => selectedNumbers.has(match.roundNumber) && match.participantIds.includes(text(row.id))).map((match) => match.matchId),
    }));
    requireLeadersValue(players.every((row) => row.playerId && row.displayName && row.team.teamId) && new Set(players.map((row) => row.playerId)).size === players.length);
    const rankings = PLAYER_METRICS.map(([metric]) => {
      const ranked = rankPlayerRows(performance, metric);
      return { metric, order: ranked.map((row) => ({
        playerId: text(row.id), rank: row.displayRank,
        tied: row.displayRank !== null && ranked.filter((other) => other.displayRank === row.displayRank).length > 1,
      })) };
    });
    return { players, rankings };
  };
  return {
    metrics: PLAYER_METRICS.map(([id, label]) => ({ id, label, direction: ["grossAvg", "netAvg"].includes(id) ? "ascending" : "descending" })),
    overall: scope(leaders.leaderboard || [], rounds),
    rounds: rounds.map((round) => ({ roundNumber: count(Number(round.number)), ...scope(leaders.roundLeaderboards?.[round.number] || [], [round]) })),
    matchReferences,
  };
}

// Scheduled, wholly unpaired Singles placeholders are not player identities.
// Keep the round itself, but never fabricate participant rows/references.
export function playerLeadersProjectionSource(source, identity) {
  requireLeadersValue(source.tournament?.tournament_id === identity.tournamentId);
  const seen = new Set();
  return { ...source, matches: (source.matches || []).filter((entry) => {
    const id = requireOpaqueMatchID(entry.match?.match_id);
    requireLeadersValue(!seen.has(id) && entry.match?.tournament_id === identity.tournamentId);
    seen.add(id);
    if (entry.participants?.length) return true;
    requireLeadersValue(Array.isArray(entry.participants) &&
      Number(entry.match.round_number) === 3 && entry.match.format === "SI" &&
      entry.match.status === "UPCOMING" && !entry.match.finalized_at &&
      Array.isArray(entry.scores) && entry.scores.length === 0 && !entry.result);
    return false;
  }) };
}
