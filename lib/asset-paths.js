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

export const canonicalCourseLogoFilenames = Object.freeze({
  TPGC01: "turtle-point-logo",
  CPGC01: "cougar-point-logo",
  OCGC01: "ocean-course-logo",
});

export function courseLogoSources({ courseId, filename } = {}) {
  const canonicalFilename = canonicalCourseLogoFilenames[String(courseId || "").trim().toUpperCase()];
  return [...new Set([
    courseLogo(filename),
    courseLogo(canonicalFilename),
    defaultAssets.courseLogo,
  ].filter(Boolean))];
}

export function optimizedAssetUrl(source, width = 64, quality = 75) {
  const value = String(source || "").trim();
  if (!value || !value.startsWith("/")) return value || null;
  const safeWidth = [32, 48, 64, 96, 128, 256].includes(Number(width)) ? Number(width) : 64;
  const safeQuality = Math.min(100, Math.max(1, Number(quality) || 75));
  return `/_next/image?url=${encodeURIComponent(value)}&w=${safeWidth}&q=${safeQuality}`;
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
