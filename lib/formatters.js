export function parseNumericValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  let normalized = String(value)
    .trim()
    .replace(/^'+/, "")
    .replace(/,/g, "")
    .replace(/[−–—]/g, "-");
  const parenthetical = /^\(.+\)$/.test(normalized);

  if (parenthetical) {
    normalized = normalized.slice(1, -1).trim();
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return parenthetical ? -Math.abs(numeric) : numeric;
}

export function formatHandicap(value) {
  const handicap = parseNumericValue(value);
  if (handicap === null) return "—";

  const displayValue = Math.abs(handicap).toFixed(1);
  return handicap < 0 ? `(${displayValue})` : displayValue;
}

function formatFixed(value, fractionDigits) {
  const points = parseNumericValue(value);
  if (points === null) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(points);
}

export function formatPlayerPoints(value) {
  return formatFixed(value, 2);
}

export function formatTeamPoints(value) {
  return formatFixed(value, 1);
}

export function formatCalcuttaPoints(value) {
  const points = parseNumericValue(value);
  if (points === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 }).format(points);
}

export function formatStatusLabel(value, {
  current = false,
  complete = false,
} = {}) {
  if (current) return "Current Match";
  if (complete) return "Final";
  const status = String(value ?? "").trim().toUpperCase();
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "Final";
  if (["LIVE", "OPEN", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "Live";
  if (["LOCKED", "CLOSED"].includes(status)) return "Locked";
  return "Upcoming";
}
