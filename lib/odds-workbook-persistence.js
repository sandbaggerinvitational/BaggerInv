const NON_FINITE_ODDS = new Set(["+∞", "-∞", "Infinity", "+Infinity", "-Infinity"]);
const CANONICAL_FINITE_ODDS = /^[+-]?\d+$/;

export function oddsWorkbookValue(row = {}, { worksheet, identity = {} } = {}) {
  const probability = Number(row.probability);
  const raw = row.americanOdds;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && CANONICAL_FINITE_ODDS.test(raw.trim())) return Number(raw);
  if ((probability === 0 || probability === 100) && (
    (typeof raw === "number" && !Number.isFinite(raw)) ||
    (typeof raw === "string" && NON_FINITE_ODDS.has(raw.trim()))
  )) return "";
  const error = new Error(`${worksheet}.American Odds has no persistence-safe numeric representation.`);
  error.workbookContract = {
    worksheet,
    field: "American Odds",
    value: raw,
    runtimeType: typeof raw,
    finite: typeof raw === "number" && Number.isFinite(raw),
    probability: row.probability,
    expectedType: "finite native number, or blank only for a 0%/100% non-finite outcome",
    ...identity,
  };
  throw error;
}

export function oddsPersistenceDiagnostics(snapshot = {}, displayOdds = (value) => String(value ?? "")) {
  return [
    ...(snapshot.teams || []).map((row) => ({ worksheet: "Odds Team Results", entity: "team", id: row.side, name: row.name, row })),
    ...(snapshot.players || []).map((row) => ({ worksheet: "Odds Player Results", entity: "player", id: row.id, name: row.name, row })),
  ].filter(({ row }) => {
    const raw = row.americanOdds;
    return (typeof raw === "number" && !Number.isFinite(raw)) || (typeof raw === "string" && NON_FINITE_ODDS.has(raw.trim()));
  }).map(({ worksheet, entity, id, name, row }) => ({
    worksheet,
    entity,
    id,
    name,
    probability: row.probability,
    rawAmericanOdds: row.americanOdds,
    runtimeType: typeof row.americanOdds,
    finite: typeof row.americanOdds === "number" && Number.isFinite(row.americanOdds),
    displayAmericanOdds: displayOdds(row.americanOdds),
    workbookAmericanOdds: "",
  }));
}
