const clean = (value) => String(value ?? "").trim();

export const LIVE_PAIRING_FIELDS = [
  "Team 1 Player 1",
  "Team 1 Player 2",
  "Team 2 Player 1",
  "Team 2 Player 2",
];

function rosterPlayerIds(rosters, year, side) {
  return new Set(
    rosters
      .filter((row) =>
        String(row.Year ?? "") === String(year ?? "") &&
        clean(row["Team Side"]) === `Team ${side}`
      )
      .map((row) => clean(row["Player ID"]))
      .filter(Boolean)
  );
}

export function validateLiveMatchPairing({
  match = {},
  updates = {},
  playerIds = [],
  rosters = [],
} = {}) {
  if (clean(match["Match Status"]).toLowerCase() === "final") {
    throw new Error("Reopen the finalized match before changing its pairing.");
  }

  const pairing = Object.fromEntries(
    LIVE_PAIRING_FIELDS.map((field) => [field, clean(updates[field])])
  );
  const singles = clean(match.Format).toUpperCase() === "SI";
  const required = singles
    ? ["Team 1 Player 1", "Team 2 Player 1"]
    : LIVE_PAIRING_FIELDS;

  for (const field of required) {
    if (!pairing[field]) throw new Error(`${field} is required.`);
  }
  if (singles) {
    pairing["Team 1 Player 2"] = "";
    pairing["Team 2 Player 2"] = "";
  }

  const selected = Object.values(pairing).filter(Boolean);
  if (new Set(selected).size !== selected.length) {
    throw new Error("A player cannot appear more than once in the same match.");
  }

  const knownPlayers = new Set(playerIds.map(clean).filter(Boolean));
  for (const playerId of selected) {
    if (!knownPlayers.has(playerId)) throw new Error(`Player ${playerId} was not found.`);
  }

  for (const side of [1, 2]) {
    const eligible = rosterPlayerIds(rosters, match.Year, side);
    if (!eligible.size) continue;
    for (const slot of [1, 2]) {
      const playerId = pairing[`Team ${side} Player ${slot}`];
      if (playerId && !eligible.has(playerId)) {
        throw new Error(`${playerId} is not assigned to Team ${side} for ${match.Year}.`);
      }
    }
  }

  return pairing;
}
