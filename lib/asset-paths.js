const BASE = "/images";
const DEFAULTS = `${BASE}/defaults`;

function cleanFilename(filename) {
  return String(filename ?? "")
    .trim()
    .replace(/\.(png|jpe?g|webp|avif)$/i, "");
}

function asset(folder, filename, extension = "webp") {
  const clean = cleanFilename(filename);
  return clean ? `${BASE}/${folder}/${clean}.${extension}` : null;
}

export function tournamentHero(filename) {
  return asset("tournaments/hero", filename);
}

export function tournamentLogo(filename) {
  return asset("tournaments/logos", filename, "png");
}

export function courseLogo(filename) {
  return asset("courses/logos", filename, "png");
}

export function courseHero(filename) {
  return asset("courses/hero", filename);
}

export function teamLogo(filename) {
  return asset("teams/logos", filename);
}

export function playerPhoto(filename) {
  return asset("players", filename);
}

export const defaultAssets = {
  player: `${DEFAULTS}/player.webp`,
  teamLogo: `${DEFAULTS}/team-logo.webp`,
  courseLogo: `${DEFAULTS}/course-logo.webp`,
  courseHero: `${DEFAULTS}/course-hero.webp`,
  tournamentHero: `${DEFAULTS}/tournament-hero.webp`,
};

export const homePageHero = `${BASE}/home-page-hero.webp`;
