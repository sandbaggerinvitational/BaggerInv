const BASE = "/images";

function withExtension(folder, filename, extension) {
  const clean = String(filename ?? "").trim();
  if (!clean) return null;
  return `${BASE}/${folder}/${clean}.${extension}`;
}

export function tournamentHero(filename) {
  return withExtension("tournaments/hero", filename, "webp");
}

export function courseLogo(filename) {
  return withExtension("courses/logos", filename, "png");
}

export function teamLogo(filename) {
  return withExtension("teams/logos", filename, "png");
}

export function playerPhoto(filename) {
  return withExtension("players", filename, "webp");
}

export const homePageHero = `${BASE}/home-page-hero.webp`;
