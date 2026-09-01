const clean = (value) => String(value ?? "").trim();

export function mergeCanonicalPlayerPresentation(player = {}, canonicalPlayers = []) {
  const canonical = canonicalPlayers.find((row) => clean(row.id) === clean(player.id)) || {};
  return {
    ...player,
    slug: clean(player.slug || canonical.slug),
    photo: clean(player.photo || canonical.photo),
  };
}

export function mergeCanonicalLeaderboardPresentation(rows = [], canonicalPlayers = []) {
  const presentationById = new Map(
    canonicalPlayers.map((row) => [clean(row.id), row]).filter(([id]) => id)
  );
  return rows.map((row) => {
    const historicalPlayer = row?.player && typeof row.player === "object" ? row.player : {};
    const playerId = clean(row?.id || historicalPlayer["Player ID"]);
    const canonical = presentationById.get(playerId);
    if (!canonical) return row;
    const slug = clean(row?.slug || historicalPlayer.slug || historicalPlayer.Slug || canonical.slug);
    const photo = clean(canonical.photo);
    return {
      ...row,
      slug,
      photo,
      player: {
        ...historicalPlayer,
        ...(slug ? { Slug: slug, slug } : {}),
        ...(photo ? { "Photo Filename": photo } : {}),
      },
    };
  });
}

export function playerProfileFromLeaderboardsCore(tournamentData = {}, identity = {}) {
  const canonical = (tournamentData.players || []).find((row) => clean(row.id) === clean(identity.playerId)) || {};
  const team = Number(canonical.teamSide) === 1
    ? tournamentData.tournament?.teamOne
    : Number(canonical.teamSide) === 2
      ? tournamentData.tournament?.teamTwo
      : null;
  return {
    player: {
      id: clean(canonical.id || identity.playerId),
      name: clean(canonical.name || identity.scorerName || identity.playerId),
      slug: clean(canonical.slug),
      photo: clean(canonical.photo),
      teamName: clean(team?.name || identity.resolved?.context?.team?.name),
      teamLogo: clean(team?.logo),
      tournamentHandicap: canonical.tournamentHandicap ?? null,
    },
    tournament: tournamentData.tournament || identity.resolved?.context?.tournament || null,
  };
}
