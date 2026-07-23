export function draftValueScore(draftPosition, tournamentFinish) {
  if (
    draftPosition === null || draftPosition === undefined || draftPosition === "" ||
    tournamentFinish === null || tournamentFinish === undefined || tournamentFinish === ""
  ) return null;
  const drafted = Number(draftPosition);
  const finished = Number(tournamentFinish);
  return Number.isFinite(drafted) && Number.isFinite(finished)
    ? drafted - finished
    : null;
}

export function gradeForScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "—";
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A−";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B−";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C−";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  return "F";
}

export function relativeDraftResults(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) return [];
  const ranked = rows
    .map((row) => ({
      ...row,
      strength: Number.isFinite(Number(row.strength)) ? Number(row.strength) : 0,
      objective: Number.isFinite(Number(row.objective)) ? Number(row.objective) : 0,
    }))
    .sort((a, b) => b.strength - a.strength);
  const gap = Math.abs(ranked[0].strength - ranked[1].strength);
  const bothObjectivelyPoor = ranked.every((row) => row.objective <= -8);
  const topScore = Math.round(Math.min(
    99,
    Math.max(82, 93 + gap * 0.12 + Math.max(-3, Math.min(3, ranked[0].objective / 10)))
  ));
  const lowerScore = Math.round(Math.max(70, topScore - gap * 0.35));

  const topGrade = bothObjectivelyPoor
    ? "B−"
    : topScore >= 97
      ? "A+"
      : "A";
  const lowerGrade = bothObjectivelyPoor
    ? "C"
    : gap <= 4
      ? "A−"
      : gap <= 12
        ? "B+"
        : gap <= 28
          ? "B"
          : "B−";

  const results = [
    { ...ranked[0], score: topScore, grade: topGrade, rank: 1 },
    { ...ranked[1], score: lowerScore, grade: lowerGrade, rank: 2 },
  ];
  return rows.map((row) => results.find((result) => result.id === row.id));
}
