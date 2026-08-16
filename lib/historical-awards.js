const clean = (value) => String(value ?? "").trim();

export function projectHistoricalAwards(awards, year, playerMap) {
  return (Array.isArray(awards) ? awards : [])
    .filter((award) =>
      Number(award?.Year) === Number(year) &&
      clean(award?.Award) &&
      clean(award?.Winner)
    )
    .map((award) => ({
      ...award,
      winnerPlayer: playerMap?.[award.Winner] || null,
    }));
}
