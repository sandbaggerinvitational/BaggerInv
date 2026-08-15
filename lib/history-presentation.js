import { tournamentHero } from "./asset-paths.js";

const clean = (value) => String(value ?? "").trim();

export function historyEditionNumber(year) {
  const numericYear = Number(year);
  return Number.isInteger(numericYear) && numericYear >= 2017
    ? numericYear - 2016
    : null;
}

export function historyOrdinal(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) return "";
  const remainder100 = numeric % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? "TH"
    : numeric % 10 === 1 ? "ST"
    : numeric % 10 === 2 ? "ND"
    : numeric % 10 === 3 ? "RD"
    : "TH";
  return `${numeric}${suffix}`;
}

export function historyEditionLabel(year) {
  const edition = historyEditionNumber(year);
  return edition
    ? `${historyOrdinal(edition)} ANNUAL SANDBAGGER INVITATIONAL`
    : "SANDBAGGER INVITATIONAL";
}

export function historyHeroFilename(value) {
  return clean(value)
    .replace(/\.(?:png|jpe?g|webp|avif)$/i, "")
    .replace(/-profile\d*$/i, "");
}

export function historyHeroPath(tournament = {}) {
  return tournamentHero(historyHeroFilename(tournament["Hero Image"]));
}

export function historyCourseDisplayName(courseId, courses = [], fallback = "") {
  const requested = clean(courseId).toLowerCase();
  if (!requested) return clean(fallback);
  const course = courses.find((candidate) =>
    clean(candidate?.["Course ID"] ?? candidate?.courseId ?? candidate?.id).toLowerCase() === requested
  );
  return clean(course?.Course ?? course?.courseName ?? course?.name ?? fallback) || "Recorded course";
}

export function historyTournamentComplete(tournament = {}) {
  return tournament.complete === true || clean(tournament.lifecycle).toUpperCase() === "FINAL";
}

export function historyTournamentCardResult(tournament = {}) {
  if (tournament.championTeam?.name) return tournament.championTeam.name;
  if (historyTournamentComplete(tournament)) return "Champion pending";
  return Number(tournament.year) === 2026
    ? "Tournament in progress"
    : "Upcoming Invitational";
}

export function historyStandingsSummary(rows = [], cutoffRank = 5) {
  return rows.filter((row) => {
    const rank = Number(String(row?.tournamentRank ?? row?.rank ?? "").replace(/\D/g, ""));
    return Number.isFinite(rank) && rank > 0 && rank <= cutoffRank;
  });
}
