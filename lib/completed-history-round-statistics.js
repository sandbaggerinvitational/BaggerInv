const clean = (value) => String(value ?? "").trim();

export function formatCompletedHistoryToPar(value, { accessible = false } = {}) {
  if (!Number.isFinite(Number(value))) return "";
  const rounded = Number(Number(value).toFixed(1));
  if (rounded === 0) return accessible ? "even to par" : "EVEN TO PAR";
  const magnitude = Math.abs(rounded).toFixed(1);
  if (accessible) return `${rounded > 0 ? "plus" : "minus"} ${magnitude} to par`;
  return `${rounded > 0 ? "+" : "−"}${magnitude} TO PAR`;
}

export function completedHistoryHoleStatisticItem({ label, hole }) {
  const hasCanonicalEvidence = hole &&
    Number.isFinite(Number(hole.holeNumber)) &&
    Number.isFinite(Number(hole.par)) &&
    Number.isFinite(Number(hole.scoringAverage?.value)) &&
    Number.isFinite(Number(hole.averageToPar?.value)) &&
    Number(hole.averageToPar?.sampleSize) > 0;
  if (!hasCanonicalEvidence) {
    return { label, value: "—" };
  }
  const relationship = formatCompletedHistoryToPar(hole.averageToPar?.value);
  const accessibleRelationship = formatCompletedHistoryToPar(hole.averageToPar?.value, { accessible: true });
  const tee = clean(hole.tee);
  const sample = clean(hole.averageToPar?.label);
  return {
    label,
    value: `#${hole.holeNumber}`,
    detail: [relationship, tee ? `${tee} Tees` : ""].filter(Boolean).join(" · "),
    sample,
    accessibleLabel: [
      label,
      `Hole ${hole.holeNumber}`,
      accessibleRelationship,
      sample,
    ].filter(Boolean).join(", "),
  };
}

export function orderCompletedHistoryRoundStatistics({
  format,
  lowestFrontNine,
  lowestBackNine,
  lowestRound,
  lowestTeamRound,
  birdieLeader,
  averageScore,
  hardestHole,
  easiestHole,
} = {}) {
  const roundItem = clean(format).toUpperCase() === "SC" ? lowestTeamRound : lowestRound;
  return [
    lowestFrontNine,
    lowestBackNine,
    roundItem,
    birdieLeader,
    averageScore,
    hardestHole,
    easiestHole,
  ].filter(Boolean);
}
