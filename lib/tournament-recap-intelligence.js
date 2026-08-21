import { projectionPresentationLabel } from "./projection-phases.js";

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const id = (value) => String(value ?? "");
const publishedRank = (player, fallback) => Number.isInteger(Number(player?.rank)) && Number(player.rank) > 0 ? Number(player.rank) : fallback;
const ordinal = (value) => {
  const rank = Number(value);
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[rank % 10] || "th";
  return `${rank}${suffix}`;
};

function rankedActualPlayers(leaderboard = []) {
  const sorted = leaderboard.slice().sort((left, right) => number(right.points) - number(left.points) || number(right.wins) - number(left.wins) || number(left.losses) - number(right.losses) || String(left.player || left.name).localeCompare(String(right.player || right.name)));
  let priorPoints = null, priorRank = 0;
  return sorted.map((player, index) => {
    const points = number(player.points);
    const rank = index && points === priorPoints ? priorRank : index + 1;
    priorPoints = points; priorRank = rank;
    return { ...player, id: id(player.id), name: player.player || player.name || player.id, rank, points };
  });
}

function playerAt(snapshot, playerId) {
  const index = (snapshot?.players || []).findIndex((player) => id(player.id) === id(playerId));
  return index < 0 ? null : { ...snapshot.players[index], rank: publishedRank(snapshot.players[index], index + 1) };
}

function teamAt(snapshot, name) {
  return (snapshot?.teams || []).find((team) => String(team.name) === String(name)) || null;
}

function extreme(rows, field, direction) {
  return rows.filter((row) => Number.isFinite(Number(row[field]))).sort((left, right) => direction * (number(right[field]) - number(left[field])))[0] || null;
}

export function buildTournamentRecapIntelligence({ snapshots = [], tournament = {}, leaderboard = [] } = {}) {
  const published = snapshots.filter((snapshot) => Array.isArray(snapshot?.players)).slice().sort((left, right) => number(left.phaseOrder) - number(right.phaseOrder));
  const recapSnapshot = published.find((snapshot) => snapshot.phase === "Final Results") || null;
  if (!recapSnapshot) return null;
  const projections = published.filter((snapshot) => snapshot.phase !== "Final Results");
  const opening = projections.find((snapshot) => snapshot.phase === "Pre-Tournament") || projections[0] || null;
  const latestProjection = projections.at(-1) || opening;
  const actualPlayers = rankedActualPlayers(leaderboard);
  const actualById = new Map(actualPlayers.map((player) => [id(player.id), player]));
  const teams = [tournament.teamOne, tournament.teamTwo].filter(Boolean).map((team, index) => ({ ...team, side: index + 1, score: number(team.score) })).sort((left, right) => right.score - left.score);
  const highScore = teams[0]?.score ?? 0;
  const champions = teams.filter((team) => team.score === highScore);
  const tied = champions.length > 1;
  const winningMargin = tied ? 0 : highScore - number(teams[1]?.score);
  const mvp = actualPlayers[0] || null;

  const journeys = actualPlayers.map((actual) => ({
    ...actual,
    milestones: published.map((snapshot) => {
      const player = playerAt(snapshot, actual.id);
      return player ? { phase: snapshot.phase, label: projectionPresentationLabel(snapshot.phase), probability: number(player.probability), americanOdds: player.americanOdds, projectedRank: player.rank, publishedAt: snapshot.publishedAt } : null;
    }).filter(Boolean),
  }));

  const openingPlayers = (opening?.players || []).map((player, index) => {
    const actual = actualById.get(id(player.id));
    const openingRank = publishedRank(player, index + 1);
    return actual ? { id: id(player.id), name: player.name, openingRank, openingProbability: number(player.probability), openingOdds: player.americanOdds, projectedFinish: number(player.averageFinish, openingRank), actualRank: actual.rank, actualPoints: actual.points, rankDelta: openingRank - actual.rank, finishError: Math.abs(number(player.averageFinish, openingRank) - actual.rank) } : null;
  }).filter(Boolean);
  const openingFavorite = openingPlayers[0] || null;
  const mvpOpening = mvp ? openingPlayers.find((player) => player.id === id(mvp.id)) || null : null;
  const biggestSurprise = openingPlayers.filter((player) => player.rankDelta > 0).sort((left, right) => right.rankDelta - left.rankDelta)[0] || null;

  const movementRows = actualPlayers.map((actual) => {
    const history = projections.map((snapshot) => playerAt(snapshot, actual.id)).filter(Boolean);
    if (history.length < 2) return null;
    const first = history[0], last = history.at(-1);
    return { id: actual.id, name: actual.name, rankMovement: first.rank - last.rank, probabilityMovement: number(last.probability) - number(first.probability), first, last };
  }).filter(Boolean);
  const largestRise = extreme(movementRows.filter((player) => player.rankMovement > 0), "rankMovement", 1);
  const largestFall = extreme(movementRows.filter((player) => player.rankMovement < 0), "rankMovement", -1);
  const largestProbabilityGain = extreme(movementRows.filter((player) => player.probabilityMovement > 0), "probabilityMovement", 1);
  const largestProbabilityLoss = extreme(movementRows.filter((player) => player.probabilityMovement < 0), "probabilityMovement", -1);

  const outlook = published.find((snapshot) => snapshot.phase === "After Round 2");
  const singles = published.find((snapshot) => snapshot.phase === "Round 3 Pairings Announced");
  const captainImpact = outlook && singles ? teams.map((team) => {
    const before = teamAt(outlook, team.name), after = teamAt(singles, team.name);
    return before && after ? { name: team.name, before: number(before.probability), after: number(after.probability), change: number(after.probability) - number(before.probability) } : null;
  }).filter(Boolean) : [];

  const closestProjection = openingPlayers.slice().sort((left, right) => left.finishError - right.finishError)[0] || null;
  const largestMiss = openingPlayers.slice().sort((left, right) => right.finishError - left.finishError)[0] || null;
  const meanFinishError = openingPlayers.length ? openingPlayers.reduce((sum, player) => sum + player.finishError, 0) / openingPlayers.length : null;
  const openingTeamFavorite = (opening?.teams || []).slice().sort((left, right) => number(right.probability) - number(left.probability))[0] || null;
  const openingTeamFinished = openingTeamFavorite ? (champions.some((team) => team.name === openingTeamFavorite.name) ? 1 : 2) : null;

  let story = "The completed tournament is now preserved through its official Championship Projection journey.";
  if (!tied && champions[0]) {
    const championOpening = teamAt(opening, champions[0].name);
    story = championOpening
      ? `${champions[0].name} overcame a ${number(championOpening.probability).toFixed(1).replace(/\.0$/, "")}% Opening Championship Projection to win ${tournament.name || "the Sandbagger Invitational"}.`
      : `${champions[0].name} won ${tournament.name || "the Sandbagger Invitational"} by ${winningMargin.toFixed(1).replace(/\.0$/, "")} points.`;
  }
  if (mvp && mvpOpening) story += ` ${mvp.name} began tournament week at ${mvpOpening.openingProbability.toFixed(1).replace(/\.0$/, "")}% before finishing as Tournament MVP.`;

  return {
    year: recapSnapshot.year,
    champion: { tied, teams, champions, winningMargin, finalScore: teams.map((team) => team.score).join("–") },
    mvp,
    accuracy: { openingFavorite, mvpOpening, biggestSurprise },
    movers: { largestRise, largestFall, largestProbabilityGain, largestProbabilityLoss },
    journeys,
    captainImpact,
    modelAccuracy: { openingTeamFavorite, openingTeamFinished, closestProjection, largestMiss, meanFinishError },
    story,
    opening,
    latestProjection,
  };
}

export function finishLabel(rank) {
  return rank ? ordinal(rank) : "Not ranked";
}
