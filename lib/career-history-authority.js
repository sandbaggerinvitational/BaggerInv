export const COMPLETED_CAREER_HISTORY_YEARS = Object.freeze([
  2017,
  2018,
  2019,
  2020,
  2021,
  2022,
  2023,
  2024,
  2025,
]);

const completedYears = new Set(COMPLETED_CAREER_HISTORY_YEARS);
const collections = [
  "players",
  "tournaments",
  "teamNames",
  "matches",
  "rounds",
  "rules",
  "awards",
  "courses",
  "handicaps",
  "ghostMatches",
];
const yearScopedCollections = new Set([
  "tournaments",
  "teamNames",
  "matches",
  "rules",
  "awards",
  "courses",
  "handicaps",
  "ghostMatches",
]);
const clean = (value) => String(value ?? "").trim();

function mergePlayers(canonicalPlayers = [], currentPlayers = []) {
  const rows = new Map();
  for (const player of canonicalPlayers) {
    const id = clean(player?.["Player ID"]);
    if (id) rows.set(id, player);
  }
  // Current player-directory identity and 2026 participation stay unchanged.
  // Canonical archive rows only fill identities absent from the current bundle.
  for (const player of currentPlayers) {
    const id = clean(player?.["Player ID"]);
    if (id) rows.set(id, player);
  }
  return [...rows.values()];
}

/**
 * Career Profile is one cross-era view. Frozen completed years use the same
 * production archive as 2017–2025 History, while current rows retain the
 * existing 2026 contract. The inputs remain unchanged.
 */
export function mergeCanonicalCareerHistoricalData({
  canonical = {},
  current = {},
} = {}) {
  const merged = {};
  for (const key of collections) {
    const canonicalRows = Array.isArray(canonical?.[key]) ? canonical[key] : [];
    const currentRows = Array.isArray(current?.[key]) ? current[key] : [];
    if (key === "players") {
      merged[key] = mergePlayers(canonicalRows, currentRows);
      continue;
    }
    if (!yearScopedCollections.has(key)) {
      merged[key] = currentRows.length ? currentRows : canonicalRows;
      continue;
    }
    merged[key] = [
      ...canonicalRows.filter((row) => completedYears.has(Number(row?.Year))),
      ...currentRows.filter((row) => !completedYears.has(Number(row?.Year))),
    ];
  }
  return merged;
}
