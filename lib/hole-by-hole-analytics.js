const COMPLETE_STATUSES = new Set(["COMPLETE", "VERIFIED"]);
const clean = (value) => String(value ?? "").trim();
const key = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const same = (a, b) => Boolean(key(a)) && key(a) === key(b);
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, places = 2) => value === null ? null : Number(value.toFixed(places));
const percentage = (value, total) => total ? round((value / total) * 100, 1) : null;

function emptyPlayer(playerId, playerName = "") {
  return {
    playerId,
    playerName: playerName || playerId,
    completeScorecards: 0,
    totalHolesPlayed: 0,
    holesWon: 0,
    holesLost: 0,
    holesHalved: 0,
    holeDifferential: 0,
    frontNineHolesWon: 0,
    backNineHolesWon: 0,
    closingHolesWon: 0,
    birdies: 0,
    eagles: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeysOrWorse: 0,
    grossScores: [],
    netScores: [],
    par3Scores: [],
    par4Scores: [],
    par5Scores: [],
    frontNineScores: [],
    backNineScores: [],
    scoringHoles: 0,
  };
}

function finish(player) {
  return {
    playerId: player.playerId,
    playerName: player.playerName,
    sample: {
      completeScorecards: player.completeScorecards,
      scoringHoles: player.scoringHoles,
      matchPlayHoles: player.totalHolesPlayed,
    },
    totalHolesPlayed: player.totalHolesPlayed,
    holesWon: player.holesWon,
    holesLost: player.holesLost,
    holesHalved: player.holesHalved,
    holeDifferential: player.holesWon - player.holesLost,
    frontNineHolesWon: player.frontNineHolesWon,
    backNineHolesWon: player.backNineHolesWon,
    closingHolesWon: player.closingHolesWon,
    birdies: player.birdies,
    eagles: player.eagles,
    pars: player.pars,
    bogeys: player.bogeys,
    doubleBogeysOrWorse: player.doubleBogeysOrWorse,
    averageGrossScore: round(mean(player.grossScores)),
    averageNetScore: round(mean(player.netScores)),
    averagePar3Score: round(mean(player.par3Scores)),
    averagePar4Score: round(mean(player.par4Scores)),
    averagePar5Score: round(mean(player.par5Scores)),
    averageFrontNineScore: round(mean(player.frontNineScores)),
    averageBackNineScore: round(mean(player.backNineScores)),
    birdieRate: percentage(player.birdies, player.scoringHoles),
    parRate: percentage(player.pars, player.scoringHoles),
    bogeyRate: percentage(player.bogeys, player.scoringHoles),
    doubleBogeyOrWorseRate: percentage(player.doubleBogeysOrWorse, player.scoringHoles),
  };
}

function participantIds(card) {
  return [...new Set([
    card.playerId,
    ...(card.participantPlayerIds || []),
  ].map(clean).filter(Boolean))];
}

function sideParticipants(cards, side) {
  return [...new Set(cards
    .filter((card) => card.side === side)
    .flatMap(participantIds)
    .filter(Boolean))];
}

function scoringName(scorecards, playerId) {
  return scorecards.find((card) => same(card.playerId, playerId))?.playerName || playerId;
}

/**
 * Career hole-by-hole aggregates. Only COMPLETE and VERIFIED cards enter this
 * service. Team scorecards contribute match-play hole results to participants,
 * but never fabricate individual gross or net scoring totals.
 */
export function buildPlayerHoleByHoleAnalytics(scorecards = [], { playerNames = {} } = {}) {
  const complete = scorecards.filter((card) =>
    COMPLETE_STATUSES.has(clean(card.status).toUpperCase()) &&
    card.completedHoleCount === 18
  );
  const players = new Map();
  const ensure = (playerId) => {
    if (!players.has(playerId)) players.set(
      playerId,
      emptyPlayer(playerId, playerNames[playerId] || scoringName(complete, playerId))
    );
    return players.get(playerId);
  };

  for (const card of complete.filter((item) => item.scoreType === "INDIVIDUAL" && item.playerId)) {
    const player = ensure(card.playerId);
    player.completeScorecards += 1;
    if (Number.isFinite(card.total)) player.grossScores.push(card.total);
    if (Number.isFinite(card.netTotals?.total)) player.netScores.push(card.netTotals.total);
    if (Number.isFinite(card.frontNine)) player.frontNineScores.push(card.frontNine);
    if (Number.isFinite(card.backNine)) player.backNineScores.push(card.backNine);
    for (const hole of card.holes || []) {
      if (!Number.isFinite(hole.score) || !Number.isFinite(hole.par)) continue;
      player.scoringHoles += 1;
      const toPar = Number.isFinite(hole.toPar) ? hole.toPar : hole.score - hole.par;
      if (toPar <= -2) player.eagles += 1;
      else if (toPar === -1) player.birdies += 1;
      else if (toPar === 0) player.pars += 1;
      else if (toPar === 1) player.bogeys += 1;
      else player.doubleBogeysOrWorse += 1;
      if (hole.par === 3) player.par3Scores.push(hole.score);
      if (hole.par === 4) player.par4Scores.push(hole.score);
      if (hole.par === 5) player.par5Scores.push(hole.score);
    }
  }

  const byMatch = new Map();
  for (const card of complete) {
    if (!card.matchId) continue;
    if (!byMatch.has(card.matchId)) byMatch.set(card.matchId, []);
    byMatch.get(card.matchId).push(card);
    for (const playerId of participantIds(card)) ensure(playerId);
  }

  for (const cards of byMatch.values()) {
    const matchNet = cards.find((card) => card.matchNetScoring?.holeWinners)?.matchNetScoring;
    if (!matchNet?.holeWinners?.length) continue;
    const sideA = sideParticipants(cards, 1);
    const sideB = sideParticipants(cards, 2);
    for (const hole of matchNet.holeWinners) {
      if (!["A", "B"].includes(hole.winnerSide) && hole.winnerType !== "HALVED") continue;
      const holeNumber = Number(hole.holeNumber);
      const apply = (ids, result) => ids.forEach((playerId) => {
        const player = ensure(playerId);
        player.totalHolesPlayed += 1;
        if (result === "WON") {
          player.holesWon += 1;
          if (holeNumber <= 9) player.frontNineHolesWon += 1;
          else player.backNineHolesWon += 1;
          if (holeNumber >= 16) player.closingHolesWon += 1;
        } else if (result === "LOST") player.holesLost += 1;
        else player.holesHalved += 1;
      });
      if (hole.winnerSide === "A") {
        apply(sideA, "WON"); apply(sideB, "LOST");
      } else if (hole.winnerSide === "B") {
        apply(sideA, "LOST"); apply(sideB, "WON");
      } else {
        apply(sideA, "HALVED"); apply(sideB, "HALVED");
      }
    }
  }

  return [...players.values()].map(finish).sort((a, b) =>
    a.playerName.localeCompare(b.playerName)
  );
}

export function playerHoleByHoleAnalytics(scorecards, playerId, options = {}) {
  return buildPlayerHoleByHoleAnalytics(scorecards, options).find((player) => same(player.playerId, playerId)) ||
    finish(emptyPlayer(playerId));
}

function leader(players, field, direction = "highest", sampleField = null) {
  const eligible = players.filter((player) =>
    Number.isFinite(player[field]) &&
    (!sampleField || player.sample[sampleField] > 0)
  );
  eligible.sort((a, b) =>
    direction === "lowest"
      ? a[field] - b[field] || a.playerName.localeCompare(b.playerName)
      : b[field] - a[field] || a.playerName.localeCompare(b.playerName)
  );
  const winner = eligible[0] || null;
  return winner ? {
    ...winner,
    value: winner[field],
    tied: eligible.filter((player) => player[field] === winner[field]),
  } : null;
}

export function buildAdvancedHoleRecords(scorecards = [], options = {}) {
  const players = buildPlayerHoleByHoleAnalytics(scorecards, options);
  return {
    players,
    mostBirdies: leader(players, "birdies", "highest", "scoringHoles"),
    mostEagles: leader(players, "eagles", "highest", "scoringHoles"),
    mostPars: leader(players, "pars", "highest", "scoringHoles"),
    lowestAverageScore: leader(players, "averageGrossScore", "lowest", "completeScorecards"),
    lowestAverageNetScore: leader(players, "averageNetScore", "lowest", "completeScorecards"),
    lowestPar3Average: leader(players, "averagePar3Score", "lowest", "scoringHoles"),
    lowestPar4Average: leader(players, "averagePar4Score", "lowest", "scoringHoles"),
    lowestPar5Average: leader(players, "averagePar5Score", "lowest", "scoringHoles"),
    mostHolesWon: leader(players, "holesWon", "highest", "matchPlayHoles"),
    mostHolesHalved: leader(players, "holesHalved", "highest", "matchPlayHoles"),
    highestHoleDifferential: leader(players, "holeDifferential", "highest", "matchPlayHoles"),
    mostFrontNineHolesWon: leader(players, "frontNineHolesWon", "highest", "matchPlayHoles"),
    mostBackNineHolesWon: leader(players, "backNineHolesWon", "highest", "matchPlayHoles"),
    mostClosingHolesWon: leader(players, "closingHolesWon", "highest", "matchPlayHoles"),
  };
}

export const HOLE_BY_HOLE_COMPLETE_STATUSES = Object.freeze([...COMPLETE_STATUSES]);
