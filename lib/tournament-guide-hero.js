import { courseHero, defaultAssets, tournamentHero, tournamentLogo } from "./asset-paths.js";
import { formatTournamentDates, formatTournamentEdition } from "./tournament-branding.js";

const clean = (value) => String(value ?? "").trim();

function firstValue(record, fields) {
  return fields.map((field) => clean(record?.[field])).find(Boolean) || "";
}

function assetPath(value, resolver) {
  const source = clean(value);
  if (!source) return "";
  if (/^(?:https?:)?\/\//i.test(source) || source.startsWith("/")) return source;
  return resolver(source) || "";
}

function roundNumber(value) {
  const parsed = Number(clean(value).match(/\d+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function destinationCourse(courses = []) {
  return [...courses]
    .filter((course) => firstValue(course, ["Course Profile Image", "profileImage"]))
    .sort((left, right) => roundNumber(right.Round ?? right.round) - roundNumber(left.Round ?? left.round))[0] || null;
}

/**
 * Build the annual Guide identity without adding a Guide-only source. Google
 * tournament fields win; the active tournament's canonical course imagery is
 * the reusable destination fallback. The year-based logo convention preserves
 * older published projections until their next normal Guide refresh.
 */
export function annualGuideHeroModel({ tournament = {}, courses = [] } = {}) {
  const year = clean(tournament.year || tournament.Year || tournament["Tournament Year"]);
  const name = firstValue(tournament, ["Tournament Name", "Name", "name"]);
  const edition = formatTournamentEdition(firstValue(tournament, ["Tournament Edition", "editionTitle", "Annual"]));
  const dates = formatTournamentDates(firstValue(tournament, ["Tournament Dates", "Dates", "dates", "Date"]));
  const destination = firstValue(tournament, ["Destination", "Location", "location"]);
  const sourceLogo = firstValue(tournament, [
    "Annual Image", "Tournament Logo", "Tournament Logo Filename", "Logo Filename", "logoFileName", "logo",
  ]);
  const logoFileName = sourceLogo || (year ? `sandbagger-${year}` : "");
  const sourceHero = firstValue(tournament, [
    "Hero Image", "Hero Image Filename", "Homepage Image", "heroImageFileName", "heroImage",
  ]);
  const sourceMobileHero = firstValue(tournament, [
    "Mobile Hero Image", "Mobile Hero Image Filename", "Homepage Mobile Hero Image", "mobileHeroImageFileName", "mobileHeroImage",
  ]);
  const course = destinationCourse(courses);
  const courseImage = firstValue(course, ["Course Profile Image", "profileImage"]);
  const heroImage = sourceHero
    ? assetPath(sourceHero, tournamentHero)
    : courseImage
      ? assetPath(courseImage, courseHero)
      : defaultAssets.tournamentHero;
  const mobileHeroImage = sourceMobileHero
    ? assetPath(sourceMobileHero, tournamentHero)
    : heroImage;

  return {
    year,
    name,
    edition,
    dates,
    destination,
    logoImage: assetPath(logoFileName, tournamentLogo),
    logoSource: sourceLogo ? "tournament" : year ? "active-year-convention" : "missing",
    heroImage,
    mobileHeroImage,
    heroSource: sourceHero ? "tournament" : courseImage ? "current-course" : "default",
    heroAlt: destination ? `${destination} tournament destination` : "Tournament destination",
  };
}
