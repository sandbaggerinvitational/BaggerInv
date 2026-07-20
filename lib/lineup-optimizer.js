import { courseHandicap, formatCode, playingHandicaps, predict } from "./prediction-engine.js";

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

export function distinctAlternative(rows = [], side = "A") {
  const playerKey = side === "A" ? "team1Players" : "team2Players";
  const best = rows[0];
  if (!best) return null;
  const bestIds = new Set((best[playerKey] || []).map((player) => player.id));
  return rows.find((row, index) => index > 0 && (row[playerKey] || []).every((player) => !bestIds.has(player.id))) || null;
}

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round = (value, digits = 1) => Number(value.toFixed(digits));

function aggregatePairings(lineups, matchups, side) {
  const selectedKey = side === "A" ? "team1Players" : "team2Players";
  const opponentKey = side === "A" ? "team2Players" : "team1Players";
  const selectedLabel = side === "A" ? "team1Label" : "team2Label";
  const opponentLabel = side === "A" ? "team2Label" : "team1Label";
  const lineupKey = (players) => players.map((player) => player.id).join("-");

  return lineups.map((lineup) => {
    const key = lineupKey(lineup);
    const results = matchups.filter((matchup) => lineupKey(matchup[selectedKey]) === key).map((matchup) => {
      const win = side === "A" ? matchup.prediction.teamA : matchup.prediction.teamB;
      const loss = side === "A" ? matchup.prediction.teamB : matchup.prediction.teamA;
      const halve = matchup.prediction.tie;
      return {
        id: matchup.id,
        opponentPlayers: matchup[opponentKey],
        opponentLabel: matchup[opponentLabel],
        winProbability: win,
        lossProbability: loss,
        halveProbability: halve,
        expectedPoints: 3 * (win + halve * .5) / 100,
      };
    }).sort((a, b) => b.winProbability - a.winProbability);
    const wins = results.map((result) => result.winProbability);
    const expected = results.map((result) => result.expectedPoints);
    const averageWinProbability = average(wins);
    const variance = average(wins.map((value) => (value - averageWinProbability) ** 2));
    const favorable = results.filter((result) => result.winProbability > result.lossProbability).length;
    const dangerous = results.filter((result) => result.winProbability < 40 || result.lossProbability - result.winProbability >= 10).length;
    return {
      id: `${side}-${key}`,
      players: lineup,
      label: lineupLabel(lineup),
      opponentCount: results.length,
      averageWinProbability: round(averageWinProbability),
      averageLossProbability: round(average(results.map((result) => result.lossProbability))),
      averageHalveProbability: round(average(results.map((result) => result.halveProbability))),
      averageExpectedPoints: round(average(expected), 2),
      worstCaseWinProbability: round(Math.min(...wins)),
      worstCaseExpectedPoints: round(Math.min(...expected), 2),
      bestCaseWinProbability: round(Math.max(...wins)),
      favorableMatchups: favorable,
      favorablePercentage: round(results.length ? favorable / results.length * 100 : 0),
      dangerousMatchups: dangerous,
      volatility: round(Math.sqrt(variance)),
      bestMatchup: results[0],
      toughestMatchup: results.at(-1),
      matchups: results,
    };
  });
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
  limit = null,
}) {
  const code = formatCode(format);
  const size = code === "SI" ? 1 : 2;
  const roster1 = team1.players.map((player) => enrichPlayer(player, scorecard)).filter((player) => Number.isFinite(player.courseHandicap));
  const roster2 = team2.players.map((player) => enrichPlayer(player, scorecard)).filter((player) => Number.isFinite(player.courseHandicap));
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

  const team1Pairings = aggregatePairings(lineups1, matchups, "A");
  const team2Pairings = aggregatePairings(lineups2, matchups, "B");
  return { team1Pairings, team2Pairings, matchupCount: matchups.length, pairingCount: lineups1.length + lineups2.length };
}
