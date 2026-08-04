export const PROJECTION_PRESENTATION_LABELS = Object.freeze({
  "Pre-Tournament": "Opening Championship Projection",
  "After Round 1": "Round 2 Pairings Projection",
  "After Round 2": "Championship Outlook",
  "Round 3 Pairings Announced": "Championship Singles Projection",
  "Final Results": "Tournament Recap",
});

export function projectionPresentationLabel(phase) {
  return PROJECTION_PRESENTATION_LABELS[phase] || String(phase || "Championship Projection");
}

export function isTournamentRecapPhase(phase) {
  return phase === "Final Results";
}

export function tournamentRecapFromSnapshot(snapshot = {}) {
  const teams = (snapshot.teams || []).slice().sort((left, right) => Number(right.expectedPoints || 0) - Number(left.expectedPoints || 0));
  const players = (snapshot.players || []).slice().sort((left, right) => Number(right.expectedPoints || 0) - Number(left.expectedPoints || 0));
  const leadingTeamPoints = Number(teams[0]?.expectedPoints || 0);
  const champions = teams.filter((team) => Number(team.expectedPoints || 0) === leadingTeamPoints);
  const leadingPlayerPoints = Number(players[0]?.expectedPoints || 0);
  const pointsLeaders = players.filter((player) => Number(player.expectedPoints || 0) === leadingPlayerPoints);
  return { teams, players, champions, pointsLeaders };
}
