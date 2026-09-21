// Read-only presentation field. Never derives a handicap or changes PH/strokes.
// Values come from the authorized canonical match-participant row, not display overrides.
export function mobileCourseHandicap(value, format) {
  if (!["BB", "SI"].includes(String(format || "").toUpperCase())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
