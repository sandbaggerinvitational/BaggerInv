export function formatHandicap(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "—";
  }

  const handicap = Number(value);
  if (!Number.isFinite(handicap)) return "—";

  const displayValue = Number(Math.abs(handicap).toFixed(1)).toString();
  return handicap < 0 ? `(${displayValue})` : displayValue;
}
