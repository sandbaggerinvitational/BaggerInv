import { roundCompetitionRows } from "./mobile-leaderboards.js";
import { requireLeadersValue, MOBILE_LEADERS_LIMITS } from "./mobile-v1-leaders-intelligence.js";

const bounded = (value) => typeof value === "string" && value.length > 0 && value.length <= 500;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function nullableNumber(value) {
  if (value == null) return null;
  requireLeadersValue(typeof value === "number" && Number.isFinite(value));
  return value;
}

// Export the unchanged PWA competition authority. No ranking, Points, Net or
// handicap algorithm is implemented here. Performance supplies explicit bindings.
export function mobileR2PairCompetition(leaders = {}, source = {}, identity = {}, performance = []) {
  requireLeadersValue(bounded(identity.tournamentId) && source.tournament?.tournament_id === identity.tournamentId &&
    leaders.tournament?.id === identity.tournamentId);
  const rounds = (leaders.rounds || []).filter((r) => Number(r.number) === 2);
  requireLeadersValue(rounds.length <= 1);
  const round = rounds[0];
  if (!round || !["SC", "SCRAMBLE"].includes(String(round.format).trim().toUpperCase())) return null;
  const entries = (source.matches || []).filter((e) => Number(e.match?.round_number) === 2);
  requireLeadersValue(entries.length <= MOBILE_LEADERS_LIMITS.matches);
  const rows = performance.filter((p) => p.roundNumber === 2);
  requireLeadersValue(rows.length <= MOBILE_LEADERS_LIMITS.players);
  // Legacy incomplete pairings cannot be promoted into a two-person competition.
  if (rows.some((p) => p.sidePlayers?.length !== 2 || !p.partner)) return null;
  const pairs = new Map(), seenPlayers = new Set();
  for (const row of rows) {
    requireLeadersValue(row.format === "SC" && bounded(row.playerId) && !seenPlayers.has(row.playerId));
    seenPlayers.add(row.playerId);
    const matches = entries.filter((e) => e.match.match_id === row.matchId);
    requireLeadersValue(matches.length === 1 && matches[0].match.tournament_id === identity.tournamentId);
    const members = row.sidePlayers;
    requireLeadersValue(members.every((p, i) => bounded(p.playerId) && bounded(p.displayName) && p.slot === i + 1) &&
      members[0].playerId !== members[1].playerId && members.some((p) => p.playerId === row.playerId) &&
      members.some((p) => p.playerId === row.partner.playerId && p.playerId !== row.playerId));
    const sourceMembers = members.map((p) => (matches[0].participants || []).filter((s) => s.player_id === p.playerId));
    requireLeadersValue(sourceMembers.every((p) => p.length === 1) &&
      sourceMembers.every(([p], i) => Number(p.player_slot) === i + 1 &&
        (!p.tournament_id || p.tournament_id === identity.tournamentId) && (!p.match_id || p.match_id === row.matchId)) &&
      Number(sourceMembers[0][0].team_side) === Number(sourceMembers[1][0].team_side));
    const side = Number(sourceMembers[0][0].team_side);
    const team = side === 1 ? leaders.tournament.teamOne : side === 2 ? leaders.tournament.teamTwo : null;
    requireLeadersValue(team && bounded(team.id) && bounded(team.name) &&
      same(row.team, { teamId: team.id, name: team.name }));
    const key = JSON.stringify([row.matchId, row.team.teamId]);
    const previous = pairs.get(key);
    if (previous) requireLeadersValue(same(previous.sidePlayers, members) && previous.status === row.status && previous.official === row.official);
    else pairs.set(key, row);
  }
  const sourcePlayers = entries.flatMap((e) => {
    requireLeadersValue(e.match.tournament_id === identity.tournamentId);
    return (e.participants || []).map((p) => p.player_id);
  });
  requireLeadersValue(sourcePlayers.length === seenPlayers.size && sourcePlayers.every((id) => seenPlayers.has(id)) &&
    new Set(sourcePlayers).size === sourcePlayers.length);
  const ranked = roundCompetitionRows(leaders.scoreLeaderboard || [], round.number, round.format,
    leaders.roundLeaderboards?.[round.number] || [], round.matches || []);
  requireLeadersValue(ranked.length <= MOBILE_LEADERS_LIMITS.players / 2);
  const seenPairs = new Set(), seenBindings = new Set();
  const projected = ranked.map((row) => {
    requireLeadersValue(row.entityType === "PAIRING" && bounded(row.id) && !seenPairs.has(row.id) &&
      Array.isArray(row.playerIds) && row.playerIds.length === 2);
    seenPairs.add(row.id);
    const bindings = [...pairs.entries()].filter(([, p]) => same(p.sidePlayers.map((x) => x.playerId), row.playerIds));
    requireLeadersValue(bindings.length === 1 && !seenBindings.has(bindings[0][0]));
    const [key, p] = bindings[0]; seenBindings.add(key);
    requireLeadersValue(Number.isSafeInteger(row.displayRank) && row.displayRank >= 1 && row.displayRank <= ranked.length &&
      typeof row.officialFinal === "boolean" && ["upcoming", "inProgress", "final"].includes(p.status));
    return { pairId: row.id, matchId: p.matchId, displayMatchNumber: p.displayMatchNumber,
      team: { teamId: p.team.teamId, name: p.team.name },
      players: p.sidePlayers.map(({ playerId, displayName, slot }) => ({ playerId, displayName, slot })),
      rank: row.displayRank, tied: ranked.filter((other) => other.displayRank === row.displayRank).length > 1,
      points: nullableNumber(row.points), teamNetScore: nullableNumber(row.net),
      status: p.status, officialFinal: row.officialFinal };
  });
  // The PWA helper may omit wholly unplayed pairs. Do not fabricate ranked
  // rows or break existing Leaders reads; the optional competition is unavailable
  // until its unchanged authority can represent the whole canonical pair field.
  if (projected.length !== pairs.size) return null;
  return { roundNumber: 2, format: "SC", netBasis: "MATCHUP", rows: projected };
}
