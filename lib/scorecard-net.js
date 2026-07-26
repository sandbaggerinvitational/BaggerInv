const finite = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value));
const numeric = (value) => finite(value) ? Number(value) : null;

export function getStrokesOnHole(totalStrokesReceived, strokeIndex) {
  const total = Math.trunc(Number(totalStrokesReceived));
  const index = Math.trunc(Number(strokeIndex));
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(index) || index < 1 || index > 18) return 0;
  const fullCycles = Math.floor(total / 18);
  const remaining = total % 18;
  return fullCycles + (remaining > 0 && index <= remaining ? 1 : 0);
}

export function calculateIndividualNetHoleScore(grossScore, strokesAllocated) {
  const gross = numeric(grossScore);
  const strokes = numeric(strokesAllocated);
  return gross === null || strokes === null ? null : gross - strokes;
}

export function calculateBestBallNetHoleScore(playerNetScores = []) {
  const valid = playerNetScores.map(numeric).filter((value) => value !== null);
  return valid.length === playerNetScores.length && valid.length ? Math.min(...valid) : null;
}

export const calculateScrambleNetHoleScore = calculateIndividualNetHoleScore;

function completeTotal(holes, start, end, field = "netScore") {
  const selected = holes.filter((hole) => hole.holeNumber >= start && hole.holeNumber <= end);
  if (selected.length !== end - start + 1 || selected.some((hole) => !finite(hole[field]))) return null;
  return selected.reduce((sum, hole) => sum + Number(hole[field]), 0);
}

export function calculateNetNineTotals(holes = []) {
  return {
    frontNine: completeTotal(holes, 1, 9),
    backNine: completeTotal(holes, 10, 18),
  };
}

export function calculateNetRoundTotal(holes = []) {
  return completeTotal(holes, 1, 18);
}

export function calculateNetTotals(holes = []) {
  const { frontNine, backNine } = calculateNetNineTotals(holes);
  const total = calculateNetRoundTotal(holes);
  const parTotal = completeTotal(holes, 1, 18, "par");
  return {
    frontNine,
    backNine,
    total,
    toPar: total !== null && parTotal !== null ? total - parTotal : null,
  };
}

export function calculateHoleWinner(sideANetScore, sideBNetScore, context = {}) {
  const sideA = numeric(sideANetScore);
  const sideB = numeric(sideBNetScore);
  const base = {
    holeNumber: context.holeNumber ?? null,
    sideANetScore: sideA,
    sideBNetScore: sideB,
  };
  if (sideA === null || sideB === null) return { ...base, winnerType: "UNAVAILABLE" };
  if (sideA === sideB) return { ...base, winnerType: "HALVED" };
  if (sideA < sideB) {
    return {
      ...base,
      winnerType: context.sideAPlayerId ? "PLAYER" : "TEAM",
      winnerTeamId: context.sideATeamId || undefined,
      winnerPlayerId: context.sideAPlayerId || undefined,
      winnerSide: "A",
    };
  }
  return {
    ...base,
    winnerType: context.sideBPlayerId ? "PLAYER" : "TEAM",
    winnerTeamId: context.sideBTeamId || undefined,
    winnerPlayerId: context.sideBPlayerId || undefined,
    winnerSide: "B",
  };
}

export function compactInitials(value, fallback = "") {
  const words = String(value ?? "")
    .replace(/&/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .filter((word) => !["AND", "IT", "THE"].includes(word.toUpperCase()));
  if (!words.length) return String(fallback || "—").slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words.at(-1)[0]}`.toUpperCase();
}
