const BASE = "/images";
const DEFAULTS = `${BASE}/defaults`;

function cleanFilename(filename) {
  return String(filename ?? "")
    .trim()
    .replace(/\.(png|jpe?g|webp|avif)$/i, "");
}

function webp(folder, filename) {
  const clean = cleanFilename(filename);
  return clean ? `${BASE}/${folder}/${clean}.webp` : null;
}

export function tournamentHero(filename) {
  return webp("tournaments/hero", filename);
}

export function courseLogo(filename) {
  return webp("courses/logo", filename);
}

export function courseHero(filename) {
  return webp("courses/hero", filename);
}

export function teamLogo(filename) {
  return webp("teams/logo", filename);
}

export function playerPhoto(filename) {
  return webp("players", filename);
}

export const defaultAssets = {
  player: `${DEFAULTS}/player.webp`,
  teamLogo: `${DEFAULTS}/team-logo.webp`,
  courseLogo: `${DEFAULTS}/course-logo.webp`,
  courseHero: `${DEFAULTS}/course-hero.webp`,
  tournamentHero: `${DEFAULTS}/tournament-hero.webp`,
};

export const homePageHero = `${BASE}/home-page-hero.webp`;
