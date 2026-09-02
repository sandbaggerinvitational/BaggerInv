import { playerPhoto } from "./asset-paths.js";

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

/**
 * Enrich the Draft presentation by stable Player and Team IDs. Draft
 * selections, ordering, handicaps, and revision-derived facts remain
 * untouched.
 */
export function mergeCanonicalDraftPresentation(draft, canonicalPlayers = [], canonicalTeams = []) {
  if (!draft) return draft;
  const presentationById = new Map(
    canonicalPlayers.map((row) => [clean(row.id), row]).filter(([id]) => id)
  );
  const teamPresentationById = new Map(
    canonicalTeams.map((row) => [clean(row.id), row]).filter(([id]) => id)
  );
  const teams = (draft.teams || []).map((team) => {
    const canonical = teamPresentationById.get(clean(team.id));
    const logo = clean(canonical?.logo);
    return logo ? { ...team, logo } : team;
  });
  const teamById = new Map(teams.map((team) => [clean(team.id), team]));
  const picks = (draft.picks || []).map((pick) => {
    const playerId = clean(pick?.player?.id || pick?.playerId);
    const canonical = presentationById.get(playerId);
    const image = playerPhoto(canonical?.photo);
    const team = teamById.get(clean(pick.team?.id || pick.teamId)) || pick.team;
    const player = pick?.player && image && !clean(pick.player.image)
      ? { ...pick.player, image }
      : pick?.player;
    if (team === pick.team && player === pick.player) return pick;
    return { ...pick, team, player };
  });
  const pickByNumber = new Map(picks.map((pick) => [pick.pickNumber, pick]));
  return {
    ...draft,
    teams,
    picks,
    rosters: (draft.rosters || []).map((entry) => ({
      ...entry,
      team: teamById.get(clean(entry.team?.id)) || entry.team,
      picks: (entry.picks || []).map((pick) => pickByNumber.get(pick.pickNumber) || pick),
    })),
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
