export function parseNumericValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  let normalized = String(value)
    .trim()
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

  const displayValue = Number(Math.abs(handicap).toFixed(1)).toString();
  return handicap < 0 ? `(${displayValue})` : displayValue;
}

export function formatPoints(value) {
  const points = parseNumericValue(value);
  if (points === null) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(points);
}
