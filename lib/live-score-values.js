function nativeScore(value, label, { allowBlank = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (allowBlank) return "";
    throw new Error(`${label} is required.`);
  }
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 20) throw new Error(`${label} must be a whole number from 1 to 20.`);
  return numeric;
}

export function normalizeLiveScoreInput(value) {
  return nativeScore(value, "Gross score", { allowBlank: true });
}

export function normalizeLiveScoringRequest(input = {}) {
  const normalizeList = (values, label) => {
    if (!Array.isArray(values)) throw new Error(`${label} must be submitted as a score list.`);
    return values.map((value, index) => nativeScore(value, `${label} ${index + 1}`));
  };
  const holeNumber = Number(input.holeNumber);
  const expectedRevision = Number(input.expectedRevision ?? 0);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) throw new Error("Hole number must be from 1 to 18.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("Score revision is invalid.");
  return { ...input, holeNumber, expectedRevision, team1GrossScores: normalizeList(input.team1GrossScores, "Team 1 gross score"), team2GrossScores: normalizeList(input.team2GrossScores, "Team 2 gross score") };
}

export function grossScoresFromCell(value) {
  if (value === null || value === undefined || value === "") return [];
  const parsed = (() => {
    if (Array.isArray(value) || typeof value === "number") return value;
    try { return JSON.parse(String(value)); } catch { return []; }
  })();
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return values.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

export function grossScoresForWorkbook(values) {
  if (!Array.isArray(values) || !values.length) throw new Error("At least one gross score is required.");
  const native = values.map((value, index) => nativeScore(value, `Gross score ${index + 1}`));
  return native.length === 1 ? native[0] : native;
}
