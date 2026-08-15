const clean = (value) => String(value ?? "").trim();

function tournamentHandicap(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function captainFlag(...values) {
  return values.some((value) => value === true || /^(true|yes|1)$/i.test(clean(value)));
}

/**
 * Add the bounded, canonical tournament-player presentation facts required by
 * 2026 Team History. Player ID is the only join key; names and round strokes
 * are deliberately excluded from identity and handicap resolution.
 */
export function mergeHistoryTournamentPlayerMetadata(aggregate = {}, coreView = {}) {
  const canonicalPlayers = new Map(
    (coreView.players || []).map((player) => [clean(player.player_id), player])
  );
  const sourceHandicapCount = [...canonicalPlayers.values()].filter((player) =>
    tournamentHandicap(player?.tournament_source_payload?.["Tournament Handicap"]) !== null
  ).length;
  const sourceCaptainCount = [...canonicalPlayers.values()].filter((player) => captainFlag(
    player?.presentation?.captain,
    player?.source_payload?.Captain
  )).length;
  let matchedPlayerCount = 0;
  let matchedHandicapCount = 0;
  let matchedCaptainCount = 0;

  const players = (aggregate.players || []).map((player) => {
    const canonical = canonicalPlayers.get(clean(player.player_id));
    if (!canonical) return { ...player, tournament_handicap: null, captain: false };
    matchedPlayerCount += 1;
    const handicap = tournamentHandicap(
      canonical?.tournament_source_payload?.["Tournament Handicap"]
    );
    if (handicap !== null) matchedHandicapCount += 1;
    const captain = captainFlag(
      canonical?.presentation?.captain,
      canonical?.source_payload?.Captain
    );
    if (captain) matchedCaptainCount += 1;
    return {
      ...player,
      tournament_handicap: handicap,
      captain,
    };
  });

  const completeSourceHandicaps = canonicalPlayers.size > 0 && sourceHandicapCount === canonicalPlayers.size;
  if (
    (sourceHandicapCount > 0 && matchedHandicapCount === 0) ||
    (completeSourceHandicaps && matchedHandicapCount !== players.length) ||
    (sourceCaptainCount > 0 && matchedCaptainCount !== sourceCaptainCount)
  ) {
    const error = new Error("Canonical tournament-player metadata did not match the History roster.");
    error.code = "HISTORY_2026_TOURNAMENT_PLAYER_ID_MISMATCH";
    error.diagnostics = {
      historyPlayerCount: players.length,
      canonicalPlayerCount: canonicalPlayers.size,
      sourceHandicapCount,
      matchedPlayerCount,
      matchedHandicapCount,
      sourceCaptainCount,
      matchedCaptainCount,
    };
    throw error;
  }

  return { ...aggregate, players };
}
