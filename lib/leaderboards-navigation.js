export const LEADERBOARD_MODULES = Object.freeze([
  Object.freeze({ value: "players", label: "Players" }),
  Object.freeze({ value: "teams", label: "Teams" }),
  Object.freeze({ value: "skins", label: "Net Skins" }),
  Object.freeze({ value: "insights", label: "Insights" }),
]);

const LEADERBOARD_MODULE_VALUES = new Set(LEADERBOARD_MODULES.map(({ value }) => value));

export function normalizeLeaderboardModule(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEADERBOARD_MODULE_VALUES.has(normalized) ? normalized : "players";
}

export function isLegacyCalcuttaModule(value) {
  return String(value || "").trim().toLowerCase() === "calcutta";
}
