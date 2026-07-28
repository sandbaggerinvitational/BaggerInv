const clean = (value) => String(value ?? "").trim();

export function imageFallbackSources({
  playerPhoto,
  teamLogo,
  tournamentLogo,
} = {}) {
  return [playerPhoto, teamLogo, tournamentLogo].filter(Boolean);
}

export function appMatchStatus(match = {}) {
  const status = clean(match.status || match.matchStatus).toUpperCase();
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "Final";
  if (["LIVE", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "Live";
  if (match.scoringEnabled) return "Live";
  if (["LOCKED", "CLOSED"].includes(status) || match.accessActive === false) return "Locked";
  if (match.accessActive && !match.scoringEnabled) return "Scoring Opens Soon";
  return "Upcoming";
}

export function formatMatchResult(match = {}, playerSide) {
  const label = clean(match.result?.label);
  if (label) return label;

  const winner = clean(match.overallWinner || match.matchupWinner).toLowerCase();
  if (!winner) return "";
  if (["halved", "half", "tie", "tied"].includes(winner)) return "Halved";

  const winningSide = ["team 1", "team1", "1"].includes(winner)
    ? 1
    : ["team 2", "team2", "2"].includes(winner) ? 2 : null;
  if (!winningSide || !playerSide) return "";

  const holes = Math.abs(
    Number(match.team1HolesWon || 0) - Number(match.team2HolesWon || 0)
  );
  return winningSide === Number(playerSide)
    ? holes ? `Won ${holes} Up` : "Won"
    : holes ? `Lost ${holes} Down` : "Lost";
}

