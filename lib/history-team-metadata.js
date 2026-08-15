const clean = (value) => String(value ?? "").trim();

function tournamentHandicap(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tournament History displays the signed value recorded by that tournament.
 * It deliberately does not apply the app's generic golf-handicap convention,
 * which renders negative values parenthetically. A source-authored leading
 * plus remains explicit; numeric negative values keep their minus sign.
 */
export function formatHistoryTournamentHandicap(value) {
  if (value === null || value === undefined || clean(value) === "") return "—";
  const source = clean(value).replace(/[−–—]/g, "-");
  const numeric = Number(source);
  if (!Number.isFinite(numeric)) return "—";
  if (source.startsWith("+") && numeric >= 0) return `+${numeric.toFixed(1)}`;
  return numeric.toFixed(1);
}

function captainFlag(...values) {
  return values.some((value) => value === true || /^(true|yes|1)$/i.test(clean(value)));
}

function explicitCaptainId(source = {}) {
  return clean(
    source.captain_player_id || source.captain_id ||
    source["Captain Player ID"] || source["Captain ID"] || source.Captain
  );
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
  const sourceCaptainIds = new Set([...canonicalPlayers.values()].filter((player) => captainFlag(
    player?.presentation?.captain,
    player?.source_payload?.Captain,
    player?.tournament_source_payload?.Captain
  )).map((player) => clean(player.player_id)));
  const captainByTeamSide = new Map();
  for (const team of coreView.teams || []) {
    const captainId = explicitCaptainId(team) || explicitCaptainId(team.source_payload);
    if (captainId) captainByTeamSide.set(Number(team.team_side), captainId);
  }
  const tournamentSource = coreView?.tournament?.source_payload || {};
  for (const side of [1, 2]) {
    const captainId = clean(tournamentSource[`Captain Team ${side}`]);
    if (captainId && !captainByTeamSide.has(side)) captainByTeamSide.set(side, captainId);
  }
  const explicitCaptainCount = new Set(captainByTeamSide.values()).size;
  const expectedCaptainCount = new Set([...sourceCaptainIds, ...captainByTeamSide.values()]).size;
  const sideByPlayer = new Map();
  for (const record of aggregate.matches || []) {
    for (const participant of record.participants || []) {
      const playerId = clean(participant.player_id);
      if (playerId && !sideByPlayer.has(playerId)) {
        sideByPlayer.set(playerId, Number(participant.team_side));
      }
    }
  }
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
      canonical?.source_payload?.Captain,
      canonical?.tournament_source_payload?.Captain
    ) || captainByTeamSide.get(
      Number(canonical.team_side ?? sideByPlayer.get(clean(player.player_id)))
    ) === clean(player.player_id);
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
    (expectedCaptainCount > 0 && matchedCaptainCount !== expectedCaptainCount)
  ) {
    const error = new Error("Canonical tournament-player metadata did not match the History roster.");
    error.code = "HISTORY_2026_TOURNAMENT_PLAYER_ID_MISMATCH";
    error.diagnostics = {
      historyPlayerCount: players.length,
      canonicalPlayerCount: canonicalPlayers.size,
      sourceHandicapCount,
      matchedPlayerCount,
      matchedHandicapCount,
      sourceCaptainCount: sourceCaptainIds.size,
      explicitCaptainCount,
      expectedCaptainCount,
      matchedCaptainCount,
    };
    throw error;
  }

  return { ...aggregate, players };
}
