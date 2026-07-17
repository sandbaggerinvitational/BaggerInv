/** Competition ranking (1, T2, T2, 4). Rows must already be sorted. */
export function addTournamentRanks(rows, valueOrSelector) {
  const selector =
    typeof valueOrSelector === "function"
      ? valueOrSelector
      : (row) => row?.[valueOrSelector];

  const values = rows.map(selector);
  const counts = new Map();
  for (const value of values) {
    const key = String(value ?? "");
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let previousKey = null;
  let currentRank = 0;

  return rows.map((row, index) => {
    const value = values[index];
    const key = String(value ?? "");
    if (key !== previousKey) {
      currentRank = index + 1;
      previousKey = key;
    }
    const tied = (counts.get(key) || 0) > 1;
    return { ...row, tournamentRank: `${tied ? "T" : ""}${currentRank}` };
  });
}
