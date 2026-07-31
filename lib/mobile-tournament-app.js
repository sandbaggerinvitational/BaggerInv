import { formatStatusLabel } from "./formatters.js";
import { formatParticipantMatchResult } from "./match-result.js";

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
  if (match.scoringEnabled) return formatStatusLabel("Live");
  if (["LOCKED", "CLOSED"].includes(status) || match.accessActive === false) return "Locked";
  if (match.accessActive && !match.scoringEnabled) return formatStatusLabel("Upcoming");
  return formatStatusLabel(status);
}

export function formatMatchResult(match = {}, playerSide) {
  return formatParticipantMatchResult(match, playerSide);
}
