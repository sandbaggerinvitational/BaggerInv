const clean = (value) => String(value ?? "").trim();

export function mergeCanonicalPlayerPresentation(player = {}, canonicalPlayers = []) {
  const canonical = canonicalPlayers.find((row) => clean(row.id) === clean(player.id)) || {};
  return {
    ...player,
    slug: clean(player.slug || canonical.slug),
    photo: clean(player.photo || canonical.photo),
  };
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
