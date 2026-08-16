const clean = (value) => String(value ?? "").trim();

export const LEGACY_HISTORY_UNRESOLVED_PLAYER_NAME = "Player not recorded";

/**
 * Legacy match rows use Player 1 as the only participant slot in Singles.
 * Player 2 is meaningful only for team formats and must not become identity.
 */
export function legacyHistoryMatchPlayerIds(match = {}, side) {
  const prefix = `Team ${Number(side)} Player`;
  const fields = clean(match.Format).toUpperCase() === "SI"
    ? [`${prefix} 1`]
    : [`${prefix} 1`, `${prefix} 2`];
  return fields.map((field) => clean(match[field])).filter(Boolean);
}

export function resolveLegacyHistoryLeaderboardPlayer({
  playerId,
  year,
  playerMap = {},
  rosterRows = [],
} = {}) {
  const id = clean(playerId);
  if (!id) {
    return { id: "", player: null, resolved: false, reason: "PLAYER_ID_MISSING" };
  }

  const rosterMatch = rosterRows.some((row) =>
    Number(row?.Year) === Number(year) && clean(row?.["Player ID"]) === id
  );
  const player = playerMap[id];
  if (player && rosterMatch) {
    return { id, player, resolved: true, reason: "CANONICAL_YEAR_ROSTER" };
  }

  return {
    id,
    player: {
      "Player ID": id,
      "Display Name": LEGACY_HISTORY_UNRESOLVED_PLAYER_NAME,
      slug: "",
      __legacyIdentityUnresolved: true,
    },
    resolved: false,
    reason: player ? "YEAR_ROSTER_MISSING" : "PLAYER_RECORD_MISSING",
  };
}
