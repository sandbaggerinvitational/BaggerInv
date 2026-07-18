import { courseHandicap, formatCode, playingHandicaps, predict } from "./prediction-engine";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = null) => {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

function combinations(players, size) {
  if (size === 1) return players.map((player) => [player]);
  const result = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) result.push([players[i], players[j]]);
  }
  return result;
}

function enrichPlayer(player, scorecard) {
  const tournamentHandicap = number(player.tournamentHandicap, NaN);
  const calculated = Number.isFinite(tournamentHandicap)
    ? courseHandicap(
        tournamentHandicap,
        scorecard?.rating,
        scorecard?.slope,
        scorecard?.par
      )
    : NaN;
  return { ...player, tournamentHandicap, courseHandicap: calculated };
}

function lineupLabel(players) {
  return players.map((player) => player.name).join(" + ");
}

export function optimizeLineups({
  format,
  team1,
  team2,
  scorecard,
  historical,
  partnerships,
  headToHead,
  settings,
  limit = 5,
}) {
  const code = formatCode(format);
  const size = code === "SI" ? 1 : 2;
  const roster1 = team1.players.map((player) => enrichPlayer(player, scorecard));
  const roster2 = team2.players.map((player) => enrichPlayer(player, scorecard));
  const lineups1 = combinations(roster1, size);
  const lineups2 = combinations(roster2, size);
  const matchups = [];

  for (const lineup1 of lineups1) {
    for (const lineup2 of lineups2) {
      const players = code === "SI"
        ? [lineup1[0], lineup2[0]]
        : [...lineup1, ...lineup2];
      if (players.some((player) => !Number.isFinite(player.courseHandicap))) continue;
      const handicap = playingHandicaps(format, players.map((player) => player.courseHandicap));
      const prediction = predict({
        format,
        players,
        historical,
        partnership: partnerships,
        headToHead,
        handicap,
        settings,
        teamNames: [team1.name, team2.name],
      });
      matchups.push({
        id: `${lineup1.map((p) => p.id).join("-")}|${lineup2.map((p) => p.id).join("-")}`,
        team1Players: lineup1,
        team2Players: lineup2,
        team1Label: lineupLabel(lineup1),
        team2Label: lineupLabel(lineup2),
        prediction,
        handicap,
      });
    }
  }

  const team1Best = [...matchups]
    .sort((a, b) => b.prediction.teamA - a.prediction.teamA)
    .slice(0, limit);
  const team2Best = [...matchups]
    .sort((a, b) => b.prediction.teamB - a.prediction.teamB)
    .slice(0, limit);
  const closest = [...matchups]
    .sort((a, b) => Math.abs(a.prediction.teamA - a.prediction.teamB) - Math.abs(b.prediction.teamA - b.prediction.teamB))
    .slice(0, limit);

  return { team1Best, team2Best, closest, matchupCount: matchups.length };
}
