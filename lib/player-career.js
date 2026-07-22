function yearValue(value) {
  const year = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(year) && year >= 1900 && year <= 2200 ? year : null;
}

export function validAppearanceYears(values = []) {
  return [...new Set(values.map(yearValue).filter((year) => year !== null))].sort(
    (a, b) => a - b
  );
}

export function getPlayerCareerYears(player = {}, appearanceYears = []) {
  const appearances = validAppearanceYears(appearanceYears);
  const explicitFirst = yearValue(player["First Year"] ?? player.firstYear);
  const explicitLast = yearValue(player["Last Year"] ?? player.lastYear);

  // Recorded appearances are the most reliable source. The explicit fields are
  // retained as a fallback for rookies and alumni whose historical rows have not
  // yet been entered.
  const firstYear = appearances[0] ?? explicitFirst;
  const lastYear = appearances.at(-1) ?? explicitLast ?? firstYear;
  const active = player.active === true || /^(true|yes|y|1|active)$/i.test(
    String(player.Active ?? player.active ?? "")
  );

  return { firstYear, lastYear, active, appearances };
}

export function formatPlayerCareerYears(player = {}, appearanceYears = []) {
  const { firstYear, lastYear, active } = getPlayerCareerYears(
    player,
    appearanceYears
  );

  if (!firstYear) return null;
  if (active) return `${firstYear}–Present`;
  if (!lastYear || firstYear === lastYear) return String(firstYear);
  return `${firstYear}–${lastYear}`;
}

export function careerYearDataIssue(player = {}, appearanceYears = []) {
  const { firstYear } = getPlayerCareerYears(player, appearanceYears);
  if (firstYear) return null;
  return {
    playerId: String(player["Player ID"] ?? player.id ?? "").trim(),
    playerName: String(
      player["Display Name"] ?? player.name ?? player["Player ID"] ?? "Unknown player"
    ).trim(),
    message: "Missing First Year and no valid tournament appearance was found.",
  };
}
