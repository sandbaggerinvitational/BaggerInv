export const RESILIENCE_PHASE = "Round 3 Pairings Announced";
export const RESILIENCE_PUBLISHED_AT = "2026-08-22T12:00:00.000Z";
export const RESILIENCE_REFERENCE_FINGERPRINTS = Object.freeze({
  10_000: "9bbc58e29302111f9722f71685e49db46dc7ec5f5fe606dec7547cd6ce890dfd",
  25_000: "d3300bcc455ad5e1d1d184d5e4fbd6c86bbb1ea3f65e045dd4717426609d6f18",
  50_000: "afaa408e7e8e7d565486768f8f1c19bb2f7f581efeb7b22ecfc785e9d7c5f804",
  100_000: "4522625dfdbac8bf3071ba3378a172a405c07ac1e025de71d35df92041c03b3c",
});

export function championshipOddsResilienceFixture() {
  const teamOne = Array.from({ length: 12 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`);
  const teamTwo = Array.from({ length: 12 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
  const handicaps = [
    ...teamOne.map((id, index) => ({ Year: 2026, "Team Side": "Team 1", "Player ID": id, "Display Name": `Alpha ${index + 1}` })),
    ...teamTwo.map((id, index) => ({ Year: 2026, "Team Side": "Team 2", "Player ID": id, "Display Name": `Bravo ${index + 1}` })),
  ];
  const players = handicaps.map((row) => ({ "Player ID": row["Player ID"], "Display Name": row["Display Name"] }));
  const matches = [];
  for (const round of [1, 2]) {
    for (let index = 0; index < 6; index += 1) {
      matches.push({
        Year: 2026,
        Round: round,
        Format: round === 1 ? "BB" : "SC",
        "Match ID": `R${round}-${index + 1}`,
        "Team 1 Player 1": teamOne[index * 2],
        "Team 1 Player 2": teamOne[index * 2 + 1],
        "Team 2 Player 1": teamTwo[index * 2],
        "Team 2 Player 2": teamTwo[index * 2 + 1],
        "Team 1 Points": index % 3 === 0 ? 2 : index % 3 === 1 ? 1.5 : 1,
        "Team 2 Points": index % 3 === 0 ? 1 : index % 3 === 1 ? 1.5 : 2,
      });
    }
  }
  for (let index = 0; index < 12; index += 1) {
    matches.push({
      Year: 2026,
      Round: 3,
      Format: "SI",
      "Match ID": `R3-${index + 1}`,
      "Team 1 Player 1": teamOne[index],
      "Team 2 Player 1": teamTwo[index],
    });
  }
  const historical = Object.fromEntries([...teamOne, ...teamTwo].map((id, index) => [id, {
    sandbaggerRatings: {
      OVERALL: { rating: 1400 + index * 9, matches: 18 + (index % 7) },
      BB: { rating: 1420 + index * 7, matches: 4 + (index % 5) },
      SC: { rating: 1410 + index * 8, matches: 3 + (index % 6) },
      SI: { rating: 1390 + index * 10, matches: 5 + (index % 8) },
    },
  }]));
  return {
    sheets: {
      tournaments: [{ Year: 2026, "Tournament ID": "2026" }],
      liveTournaments: [{ Year: 2026, "Team 1 Name": "The Pickles", "Team 2 Name": "Lipp it and Rip it" }],
      players,
      handicaps,
      teamNames: [
        { Year: 2026, "Team Side": "Team 1", "Team Names": "The Pickles" },
        { Year: 2026, "Team Side": "Team 2", "Team Names": "Lipp it and Rip it" },
      ],
      tournamentRules: [1, 2, 3].map((round) => ({ Year: 2026, Round: round, Format: round === 3 ? "SI" : round === 2 ? "SC" : "BB", "Points Available": 3 })),
      matches,
      projectionMatchSource: "Resilience golden fixture",
    },
    historical,
  };
}
