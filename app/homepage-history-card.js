import { tournamentLogo } from "../lib/asset-paths.js";

const BASELINE_PUBLIC_TOURNAMENT_LOGO_YEARS = new Set(
  Array.from({ length: 10 }, (_, index) => 2017 + index),
);

export function publicHomepageTournamentLogo(tournament = {}) {
  const configured = String(tournament.logoFileName || "").trim();
  if (configured) return tournamentLogo(configured);

  const year = Number(tournament.year);
  if (!BASELINE_PUBLIC_TOURNAMENT_LOGO_YEARS.has(year)) return null;
  return tournamentLogo(`sandbagger-${year}`);
}
