const probability = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export function publishedPlayerHistory(snapshots = [], playerId = "") {
  return snapshots.map((snapshot, snapshotIndex) => {
    const rankIndex = (snapshot.players || []).findIndex((player) => String(player.id) === String(playerId));
    if (rankIndex < 0) return null;
    const player = snapshot.players[rankIndex];
    return {
      phase: projectionPhaseLabel(snapshot.phase),
      sourcePhase: snapshot.phase,
      publishedAt: snapshot.publishedAt,
      rank: rankIndex + 1,
      probability: probability(player.probability),
      americanOdds: player.americanOdds,
      player,
      current: snapshotIndex === snapshots.length - 1,
    };
  }).filter(Boolean);
}

export function projectionHistoryHighlights(history = []) {
  if (!history.length) return [];
  const values = history.filter((entry) => entry.probability !== null);
  const highest = values.slice().sort((a, b) => b.probability - a.probability)[0];
  const lowest = values.slice().sort((a, b) => a.probability - b.probability)[0];
  let largestRise = null;
  let largestDrop = null;
  values.forEach((entry, index) => {
    if (!index) return;
    const change = entry.probability - values[index - 1].probability;
    if (change > 0 && (!largestRise || change > largestRise.change)) largestRise = { entry, change };
    if (change < 0 && (!largestDrop || change < largestDrop.change)) largestDrop = { entry, change };
  });
  return history.map((entry) => ({
    ...entry,
    highlights: [
      entry === highest ? "Highest Projection" : "",
      entry === lowest && lowest !== highest ? "Lowest Projection" : "",
      entry === largestRise?.entry ? "Largest Positive Movement" : "",
      entry === largestDrop?.entry ? "Largest Negative Movement" : "",
      entry.current ? "Current" : "",
    ].filter(Boolean),
  }));
}

export function playerProjectionSummary(name, history = []) {
  if (history.length < 2) return "This is the first published Championship Projection.";
  if (history.every((entry) => entry.rank === 1)) return `${name} has remained the tournament favorite since the opening projection.`;
  const probabilities = history.map((entry) => entry.probability).filter((value) => value !== null);
  const improving = probabilities.length === history.length && probabilities.slice(1).every((value, index) => value > probabilities[index]);
  const falling = probabilities.length === history.length && probabilities.slice(1).every((value, index) => value < probabilities[index]);
  if (improving) return `${name} has improved in every published Championship Projection.`;
  if (falling) return `${name} has moved lower in every published Championship Projection.`;
  const first = history[0], current = history.at(-1);
  if (current.rank < first.rank) return `${name} has climbed from ${ordinal(first.rank)} to ${ordinal(current.rank)} since the opening projection.`;
  if (current.rank > first.rank) return `${name} has moved from ${ordinal(first.rank)} to ${ordinal(current.rank)} since the opening projection.`;
  return `${name} is currently projected ${ordinal(current.rank)}, the same position as the opening projection.`;
}

export function tournamentProjectionStory({ current, previous, playerTeams = new Map() } = {}) {
  const favorite = current?.players?.[0];
  if (!favorite) return "";
  if (!previous) return `${favorite.name} opens as the tournament favorite heading into tournament weekend.`;
  const previousRank = previous.players.findIndex((player) => String(player.id) === String(favorite.id)) + 1;
  if (previousRank > 1) return `${favorite.name} climbs from ${ordinal(previousRank)} to the top of the latest Championship Projection.`;
  const topTeams = current.players.slice(0, 10).map((player) => playerTeams.get(String(player.id))).filter(Boolean);
  const counts = new Map(topTeams.map((team) => [team, topTeams.filter((item) => item === team).length]));
  const leadingTeam = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (leadingTeam?.[1] >= 6) return `${leadingTeam[0]} place ${leadingTeam[1]} players in the Top 10 entering ${current.phase}.`;
  return `${favorite.name} remains the tournament favorite in the latest published Championship Projection.`;
}

function ordinal(value) {
  const number = Number(value);
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? "th" : number % 10 === 1 ? "st" : number % 10 === 2 ? "nd" : number % 10 === 3 ? "rd" : "th";
  return `${number}${suffix}`;
}

function projectionPhaseLabel(phase) {
  if (phase === "After Round 1") return "Round 2 Pairings";
  if (phase === "Round 3 Pairings Announced") return "Round 3 Pairings";
  return phase;
}
