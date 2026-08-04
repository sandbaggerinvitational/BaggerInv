const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const percent = (value) => `${numeric(value)?.toFixed(1).replace(/\.0$/, "") || "0"}%`;

function ordinal(value) {
  const number = Number(value);
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? "th" : number % 10 === 1 ? "st" : number % 10 === 2 ? "nd" : number % 10 === 3 ? "rd" : "th";
  return `${number}${suffix}`;
}

export function tournamentIntelligenceStorylines({ snapshots = [], playerTeams = new Map() } = {}) {
  const published = snapshots.filter((snapshot) => Array.isArray(snapshot?.players) && snapshot.players.length);
  const current = published.at(-1);
  if (!current) return [];
  if (published.length === 1) return [{
    id: "projection-introduction",
    icon: "🏆",
    headline: "Championship Projections are published.",
    support: "Storylines will evolve as additional projections are released.",
  }];

  const previous = published.at(-2);
  const stories = [];
  const favorite = current.players[0];
  const priorFavoriteRank = previous.players.findIndex((player) => String(player.id) === String(favorite.id)) + 1;
  stories.push({
    id: "current-favorite",
    icon: "🏆",
    headline: `${favorite.name} leads the Championship Projection.`,
    support: priorFavoriteRank === 1
      ? `${favorite.name} remains the favorite at ${percent(favorite.probability)} in ${projectionPresentationLabel(current.phase)}.`
      : `${favorite.name} moved from ${ordinal(priorFavoriteRank)} to the top spot in ${projectionPresentationLabel(current.phase)}.`,
  });

  const previousRanks = new Map(previous.players.map((player, index) => [String(player.id), index + 1]));
  const movement = current.players.map((player, index) => ({ player, currentRank: index + 1, previousRank: previousRanks.get(String(player.id)) }))
    .filter((entry) => entry.previousRank);
  const riser = movement.slice().sort((left, right) => (right.previousRank - right.currentRank) - (left.previousRank - left.currentRank))[0];
  if (riser && riser.previousRank > riser.currentRank) stories.push({
    id: "biggest-rise",
    icon: "📈",
    headline: `${riser.player.name} makes the biggest move.`,
    support: `${riser.player.name} climbed from ${ordinal(riser.previousRank)} to ${ordinal(riser.currentRank)} in the latest published projection.`,
  });

  const topTenTeams = current.players.slice(0, 10).map((player) => playerTeams.get(String(player.id))).filter(Boolean);
  const teamCounts = new Map();
  topTenTeams.forEach((team) => teamCounts.set(team, (teamCounts.get(team) || 0) + 1));
  const strongestTeam = [...teamCounts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (strongestTeam?.[1] >= 3) stories.push({
    id: "strongest-team",
    icon: "🔥",
    headline: `${strongestTeam[0]} own the strongest Top 10 presence.`,
    support: `${strongestTeam[0]} place ${strongestTeam[1]} players inside the current Top 10 Championship Projections.`,
  });

  if (stories.length < 3 && current.players.length > 1) {
    const first = numeric(current.players[0].probability), second = numeric(current.players[1].probability);
    const gap = first !== null && second !== null ? first - second : null;
    if (gap !== null && gap <= 5) stories.push({
      id: "closest-race",
      icon: "🔥",
      headline: "The championship projection remains tightly contested.",
      support: `${current.players[0].name} and ${current.players[1].name} are separated by ${gap.toFixed(1).replace(/\.0$/, "")} percentage point${gap === 1 ? "" : "s"}.`,
    });
  }

  return stories.slice(0, 3);
}
import { projectionPresentationLabel } from "./projection-phases.js";
