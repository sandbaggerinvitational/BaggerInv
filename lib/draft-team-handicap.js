const clean = (value) => String(value ?? "").trim();

function decimal(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function activeRoster(players = []) {
  return players.filter((player) =>
    clean(player.participation_status || player.participationStatus || "ACTIVE").toUpperCase() === "ACTIVE"
  );
}

function canonicalAverage(players) {
  if (!players.length) return null;
  const handicaps = players.map((player) => decimal(
    player.tournament_handicap_decimal ?? player.tournament_handicap ?? player.tournamentHandicap
  ));
  if (handicaps.some((value) => value === null)) return null;
  return handicaps.reduce((sum, value) => sum + value, 0) / handicaps.length;
}

/**
 * Fill only omitted Draft presentation averages from the current canonical
 * tournament roster. The stored Draft revision and its fingerprint are never
 * changed, and existing revision-authored averages always win.
 */
export function withCanonicalDraftTeamAverages(draft, players = [], { tournamentId = "" } = {}) {
  if (!draft || Number(draft.year) !== Number(tournamentId)) return draft;
  const roster = activeRoster(players);
  const teams = (draft.teams || []).map((team) => {
    if (decimal(team.averageHandicap) !== null) return team;
    const teamPlayers = roster.filter((player) =>
      clean(player.team_id || player.teamId) === clean(team.id)
      || (!clean(player.team_id || player.teamId) && clean(player.team_side || player.side) === clean(team.side))
    );
    const averageHandicap = canonicalAverage(teamPlayers);
    return averageHandicap === null ? team : { ...team, averageHandicap };
  });
  const byId = new Map(teams.map((team) => [clean(team.id), team]));
  return {
    ...draft,
    teams,
    picks: (draft.picks || []).map((pick) => ({
      ...pick,
      team: byId.get(clean(pick.team?.id || pick.teamId)) || pick.team,
    })),
    rosters: (draft.rosters || []).map((rosterEntry) => ({
      ...rosterEntry,
      team: byId.get(clean(rosterEntry.team?.id)) || rosterEntry.team,
    })),
  };
}
