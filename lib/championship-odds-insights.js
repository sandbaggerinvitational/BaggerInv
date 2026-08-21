const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const publishedRank = (player, fallback) => Number.isInteger(Number(player?.rank)) && Number(player.rank) > 0 ? Number(player.rank) : fallback;

function snapshotOrder(snapshot = {}) {
  const phaseOrder = number(snapshot.phaseOrder);
  if (phaseOrder !== null) return phaseOrder;
  const publishedAt = Date.parse(snapshot.publishedAt || "");
  return Number.isFinite(publishedAt) ? publishedAt : 0;
}

export function publishedOddsInsights(snapshots = []) {
  const published = snapshots
    .filter((snapshot) => Array.isArray(snapshot?.players) && snapshot.players.length)
    .slice()
    .sort((left, right) => snapshotOrder(left) - snapshotOrder(right));
  const current = published.at(-1) || null;
  if (!current) return { current: null, favorite: null, movers: null, players: [] };

  const previous = published.at(-2) || null;
  const previousPlayers = new Map((previous?.players || []).map((player) => [String(player.id), player]));
  const players = current.players.map((player, index) => {
    const prior = previousPlayers.get(String(player.id));
    const probability = number(player.probability);
    const priorProbability = number(prior?.probability);
    return {
      ...player,
      rank: publishedRank(player, index + 1),
      change: probability !== null && priorProbability !== null ? probability - priorProbability : null,
      previous: prior || null,
    };
  });
  const comparable = players.filter((player) => player.change !== null);
  const riser = comparable.filter((player) => player.change > 0).sort((a, b) => b.change - a.change)[0] || null;
  const faller = comparable.filter((player) => player.change < 0).sort((a, b) => a.change - b.change)[0] || null;

  return {
    current,
    previous,
    favorite: players[0] || null,
    movers: previous ? { riser, faller } : null,
    players,
  };
}
