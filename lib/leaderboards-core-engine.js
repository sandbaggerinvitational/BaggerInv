import { grossScoresFromCell } from "./live-score-values.js";
import { isOfficialMatchResult } from "./live-tournament.js";
import { getStrokesOnHole } from "./scorecard-net.js";

const clean = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function scoreArray(value) {
  return grossScoresFromCell(value).map(number).filter((item) => item !== null);
}

// Source-neutral extraction of the existing Leaderboards score aggregation.
// Google and Supabase adapters both normalize into this established row shape;
// handicap, pairing, ranking, and attribution rules remain application-owned.
export function buildScoreLeaderboard(holeScores, matchMap, courseHoles, playerMap) {
  const totals = new Map();
  const metadataFor = (match, holeNumber) => courseHoles.find((row) =>
    (!clean(row["Match ID"]) || clean(row["Match ID"]) === clean(match["Match ID"])) &&
    clean(row["Course ID"]) === clean(match["Course ID"]) &&
    Number(row["Hole Number"]) === Number(holeNumber) &&
    (!clean(match.Tee || match["Tee Played"]) || !clean(row.Tee) || clean(row.Tee) === clean(match.Tee || match["Tee Played"]))
  );
  const add = ({ entityId, playerIds, name, format, round, match, gross, net, par, holeNumber, strokeIndex }) => {
    if (!entityId || gross === null || net === null || par === null) return;
    const key = `${round}:${entityId}`;
    if (!totals.has(key)) totals.set(key, {
      id: entityId, round, match, name, format,
      entityType: format === "SC" ? "PAIRING" : "PLAYER",
      playerIds,
      slug: format === "SC" ? "" : playerMap[playerIds[0]]?.slug || "",
      photo: format === "SC" ? "" : playerMap[playerIds[0]]?.photo || "",
      gross: 0, net: 0, par: 0, holes: 0, scorecard: [],
    });
    const row = totals.get(key);
    row.gross += gross; row.net += net; row.par += par; row.holes += 1;
    row.scorecard.push({
      hole: Number(holeNumber),
      match,
      gross,
      net,
      par,
      strokeIndex,
      strokes: Math.max(0, gross - net),
    });
  };
  for (const row of holeScores) {
    const match = matchMap.get(clean(row["Match ID"]));
    if (!match) continue;
    const round = Number(match.Round) || 1;
    const format = clean(match.Format).toUpperCase();
    const matchNumber = clean(match.Match);
    const metadata = metadataFor(match, row["Hole Number"]);
    const par = number(metadata?.Par);
    const strokeIndex = number(metadata?.["Stroke Index"]);
    for (const side of [1, 2]) {
      const grossScores = scoreArray(row[`Team ${side} Gross Scores`]);
      const playerIds = [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]].map(clean).filter(Boolean);
      if (format === "SC") {
        const gross = grossScores[0] ?? null;
        const allocated = clean(match[`Team ${side} Stroke`]) || match[`Team ${side} Playing HCP`];
        const strokes = getStrokesOnHole(allocated, strokeIndex);
        const net = number(row[`Team ${side} Net Score`]) ?? (gross === null ? null : gross - strokes);
        add({
          entityId: `${clean(match["Match ID"])}:team-${side}`,
          playerIds,
          name: playerIds.map((id) => playerMap[id]?.name || id).join(" / "),
          format,
          round,
          match: matchNumber,
          gross,
          net,
          par,
          holeNumber: row["Hole Number"],
          strokeIndex,
        });
        continue;
      }
      playerIds.forEach((playerId, index) => {
        const gross = grossScores[index] ?? null;
        const allocated = clean(match[`Team ${side} Player ${index + 1} Stroke`]) || match[`Team ${side} Player ${index + 1} Playing HCP`];
        const strokes = getStrokesOnHole(allocated, strokeIndex);
        const net = gross === null ? null : gross - strokes;
        add({
          entityId: playerId,
          playerIds: [playerId],
          name: playerMap[playerId]?.name || playerId,
          format,
          round,
          match: matchNumber,
          gross,
          net,
          par,
          holeNumber: row["Hole Number"],
          strokeIndex,
        });
      });
    }
  }
  return [...totals.values()].map((row) => ({
    ...row,
    scorecard: row.scorecard.sort((a, b) => a.hole - b.hole),
    grossToPar: row.gross - row.par,
    netToPar: row.net - row.par,
  })).sort((a, b) => a.netToPar - b.netToPar || a.grossToPar - b.grossToPar);
}

export function buildLeaderboard(matches, playerMap, teamNames, { seedPlayers = [] } = {}) {
  const stats = new Map();
  const ensure = (id, side) => {
    if (!stats.has(id)) stats.set(id, {
      id, player: playerMap[id]?.name || id, slug: playerMap[id]?.slug || "",
      photo: playerMap[id]?.photo || "",
      team: teamNames[side]?.name || `Team ${side}`, teamSide: side,
      teamLogo: teamNames[side]?.logo || "",
      wins: 0, losses: 0, halves: 0, points: 0,
      matchesPlayed: 0,
    });
    return stats.get(id);
  };

  // Overall standings may exist before canonical match participants have been
  // assigned. Seed only the explicitly supplied tournament roster here; round
  // leaderboards intentionally remain derived from their actual match slots.
  for (const player of seedPlayers) {
    const id = clean(player?.id);
    const side = Number(player?.teamSide);
    if (id && [1, 2].includes(side)) ensure(id, side);
  }

  for (const match of matches) {
    for (const side of [1, 2]) {
      for (const player of match[`team${side}Players`] || []) ensure(player.id, side);
    }
  }
  for (const match of matches.filter(isOfficialMatchResult)) {
    const winner = match.matchupWinner || match.overallWinner;
    for (const side of [1, 2]) {
      const players = match[`team${side}Players`];
      const teamPoints = side === 1 ? match.team1Points : match.team2Points;
      const share = teamPoints === null ? 0 : teamPoints / Math.max(players.length, 1);
      for (const player of players) {
        const stat = ensure(player.id, side);
        stat.matchesPlayed += 1;
        stat.points += share;
        if (winner === "Halved") stat.halves += 1;
        else if (winner === `Team ${side}`) stat.wins += 1;
        else if (winner) stat.losses += 1;
      }
    }
  }
  return [...stats.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.player.localeCompare(b.player));
}
