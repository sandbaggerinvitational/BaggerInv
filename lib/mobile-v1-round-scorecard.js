import { calculateNetNineTotals, calculateNetRoundTotal } from "./scorecard-net.js";
import { requireLeadersValue } from "./mobile-v1-leaders-intelligence.js";
import { mobileRoundScorecardSummary } from "./mobile-v1-round-scorecard-summary.js";

const textOrNull = (value) => {
  if (value == null || value === "") return null;
  requireLeadersValue(typeof value === "string" && value.length <= 500);
  return value;
};
const numericOrNull = (value, minimum = -Infinity) => {
  if (value == null) return null;
  requireLeadersValue(Number.isSafeInteger(value) && value >= minimum);
  return value;
};

// One read projection for all formats. Gross and applied strokes come directly
// from stored slots; Net comes from the independently verified core row. Never
// infer strokes from Gross minus Net or use Best Ball side Net for a player.
export function mobileRoundScorecard(entry, performance, core, published = {}) {
  requireLeadersValue(core?.slotVerification?.pass === true);
  const tournamentId = textOrNull(entry.match?.tournament_id);
  requireLeadersValue(tournamentId && core.tournament?.id === tournamentId);
  const { format, matchId, roundNumber, playerId, sidePlayers, team } = performance;
  const teamScope = format === "SC";
  const participant = entry.participants.find((p) => p.player_id === playerId);
  requireLeadersValue(participant && entry.match.match_id === matchId &&
    Number(entry.match.round_number) === roundNumber && entry.match.format.toUpperCase() === format);
  const side = Number(participant.team_side), slot = teamScope ? 0 : Number(participant.player_slot) - 1;
  requireLeadersValue([1, 2].includes(side) && [0, 1].includes(slot));
  // Legacy/incomplete pairings remain valid Leaders data. This optional card
  // is unavailable until an explicit pair exists; never invent its partner.
  if (teamScope && sidePlayers.length !== 2) return null;
  if (teamScope) requireLeadersValue(performance.partner &&
    sidePlayers.some((p) => p.playerId === performance.partner.playerId && p.playerId !== playerId));

  const snapshot = entry.snapshot || {};
  if (snapshot.snapshot_id && entry.match.scoring_snapshot_id)
    requireLeadersValue(snapshot.snapshot_id === entry.match.scoring_snapshot_id);
  const belongs = (value) => {
    requireLeadersValue(!value.match_id || value.match_id === matchId);
    requireLeadersValue(!value.tournament_id || value.tournament_id === entry.match.tournament_id);
    if (value.snapshot_id && entry.match.scoring_snapshot_id)
      requireLeadersValue(value.snapshot_id === entry.match.scoring_snapshot_id);
  };
  belongs(snapshot); belongs(entry.presentation || {});
  const metadata = entry.holes || [], stored = entry.scores || [];
  for (const rows of [metadata, stored]) {
    requireLeadersValue(rows.length <= 18 && new Set(rows.map((h) => h.hole_number)).size === rows.length);
    for (const hole of rows) {
      belongs(hole);
      requireLeadersValue(Number.isSafeInteger(hole.hole_number) && hole.hole_number >= 1 && hole.hole_number <= 18);
    }
  }
  const selectedIds = teamScope ? sidePlayers.map((p) => p.playerId) : [playerId];
  const rows = core.scoreLeaderboard.filter((row) => row.entityType === (teamScope ? "PAIRING" : "PLAYER") &&
    row.playerIds.length === selectedIds.length && selectedIds.every((id, index) => row.playerIds[index] === id));
  requireLeadersValue(rows.length <= 1);
  const canonical = rows[0];
  const holes = [...metadata].sort((a, b) => a.hole_number - b.hole_number).map((hole) => {
    const raw = stored.find((s) => s.hole_number === hole.hole_number);
    const validated = canonical?.scorecard.find((s) => s.hole === hole.hole_number);
    const par = numericOrNull(hole.par, 1);
    requireLeadersValue(par === null || par <= 9);
    const gross = raw ? numericOrNull(raw[`team_${side}_gross_scores`]?.[slot], 1) : null;
    const appliedStrokes = raw ? numericOrNull(raw[`team_${side}_strokes`]?.[slot], 0) : null;
    const net = validated ? numericOrNull(validated.net) : null;
    if (raw) {
      requireLeadersValue(gross !== null && gross <= 20 && appliedStrokes !== null && net !== null &&
        validated.gross === gross && validated.strokes === appliedStrokes && validated.par === par);
      if (format !== "BB") requireLeadersValue(raw[`team_${side}_net_score`] === net);
    } else requireLeadersValue(!validated);
    return { holeNumber: hole.hole_number, par, gross, appliedStrokes, net };
  });
  requireLeadersValue(stored.every((s) => holes.some((h) => h.holeNumber === s.hole_number)));
  const complete = holes.length === 18 && holes.every((h) =>
    h.par !== null && h.gross !== null && h.appliedStrokes !== null && h.net !== null);
  const official = performance.official && complete && performance.scores.state === "completed";
  const state = official ? "official" : !holes.some((h) => h.gross !== null) ? "unavailable" :
    performance.status === "inProgress" ? "inProgress" : "incomplete";
  // Reuse the existing Net-nine helper only for Official complete scorecards.
  // No verified existing Gross-nine authority is exported: those fields stay
  // null. Whole-round totals are the already-certified performance values.
  const totals = { frontGross: null, frontNet: null, backGross: null, backNet: null, totalGross: null, totalNet: null };
  if (official) {
    const netHoles = holes.map((h) => ({ holeNumber: h.holeNumber, netScore: h.net }));
    const nine = calculateNetNineTotals(netHoles);
    requireLeadersValue(canonical.gross === performance.scores.grossScore && canonical.net === performance.scores.netScore &&
      calculateNetRoundTotal(netHoles) === performance.scores.netScore);
    totals.frontNet = nine.frontNine; totals.backNet = nine.backNine;
    totals.totalGross = performance.scores.grossScore; totals.totalNet = performance.scores.netScore;
  }
  return { tournamentId, roundNumber, matchId, format, netBasis: "MATCHUP", scope: teamScope ? "TEAM" : "PLAYER",
    playerId: teamScope ? null : playerId, team, players: teamScope ? sidePlayers : sidePlayers.filter((p) => p.playerId === playerId),
    course: { courseId: textOrNull(snapshot.course_id), name: textOrNull(entry.presentation?.course_name), tee: textOrNull(snapshot.tee) },
    state, official, complete, holes, totals,
    ...mobileRoundScorecardSummary(entry, performance, holes, official, totals, published) };
}
