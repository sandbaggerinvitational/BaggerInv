const yearOf = (row) => Number.parseInt(String(row?.Year ?? ""), 10);

export function bindOfficialProjectionMatches(sheets, year) {
  const liveMatches = (sheets.liveMatches || []).filter((row) => yearOf(row) === Number(year));
  if (!liveMatches.length) return { ...sheets, projectionMatchSource: "Matches" };
  return {
    ...sheets,
    matches: [
      ...(sheets.matches || []).filter((row) => yearOf(row) !== Number(year)),
      ...liveMatches,
    ],
    projectionMatchSource: "Live Matches",
  };
}
