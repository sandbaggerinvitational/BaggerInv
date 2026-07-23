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
