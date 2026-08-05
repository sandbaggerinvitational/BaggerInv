import { simulateTournamentOdds } from "../lib/tournament-odds.js";

const year = 2026;
const teamOne = Array.from({ length: 12 }, (_, index) => `A${index + 1}`);
const teamTwo = Array.from({ length: 12 }, (_, index) => `B${index + 1}`);
const handicaps = [
  ...teamOne.map((id, index) => ({ Year: year, "Team Side": "Team 1", "Player ID": id, "Player Name": `Player ${id}`, "Tournament Handicap": 7 + index })),
  ...teamTwo.map((id, index) => ({ Year: year, "Team Side": "Team 2", "Player ID": id, "Player Name": `Player ${id}`, "Tournament Handicap": 7 + index })),
];
const partnership = (round, format, index, points) => ({
  Year: year, Round: round, Match: index + 1, Format: format,
  "Team 1 Player 1": teamOne[index * 2], "Team 1 Player 2": teamOne[index * 2 + 1],
  "Team 2 Player 1": teamTwo[index * 2], "Team 2 Player 2": teamTwo[index * 2 + 1],
  "Team 1 Points": points[0], "Team 2 Points": points[1],
});
const roundOne = [[2.5,.5],[2,1],[1.5,1.5],[1,2],[.5,2.5],[3,0]].map((points, index) => partnership(1, "BB", index, points));
const roundTwo = [[1,2],[2.5,.5],[2,1],[.5,2.5],[1.5,1.5],[0,3]].map((points, index) => partnership(2, "SC", index, points));
const singles = teamOne.map((id, index) => ({ Year: year, Round: 3, Match: index + 1, Format: "SI", "Team 1 Player 1": id, "Team 2 Player 1": teamTwo[index] }));
const sheets = {
  handicaps,
  matches: [...roundOne, ...roundTwo, ...singles],
  tournamentRules: [1,2,3].map((round) => ({ Year: year, Round: `Round ${round}`, "Points Available": 3 })),
  teamNames: [{ Year: year, "Team Side": "Team 1", "Team Name": "The Pickles" }, { Year: year, "Team Side": "Team 2", "Team Name": "Lipp It and Rip It" }],
};
const historical = Object.fromEntries([...teamOne, ...teamTwo].map((id, index) => {
  const rating = 1640 - index * 12;
  return [id, { sandbaggerRatings: { OVERALL: { rating, matches: 12 }, BB: { rating: rating + 8, matches: 8 }, SC: { rating: rating - 4, matches: 8 }, SI: { rating: rating + 4, matches: 8 } } }];
}));
const phases = ["Pre-Tournament", "After Round 1", "After Round 2", "Round 3 Pairings Announced"];
const model = process.argv[2] || "current";
for (const phase of phases) {
  const result = simulateTournamentOdds({ sheets, historical, phase, iterations: 10_000 });
  const probabilities = result.players.map((player) => player.probability);
  console.log(JSON.stringify({
    model,
    phase,
    totalProbability: Number(probabilities.reduce((sum, value) => sum + value, 0).toFixed(1)),
    favorite: { name: result.players[0].name, probability: result.players[0].probability, odds: result.players[0].americanOdds },
    topFive: result.players.slice(0, 5).map(({ name, probability, americanOdds }) => ({ name, probability, odds: americanOdds })),
    belowOnePercent: probabilities.filter((value) => value < 1).length,
    atZero: probabilities.filter((value) => value === 0).length,
    longestOdds: result.players.at(-1).americanOdds,
  }));
}
