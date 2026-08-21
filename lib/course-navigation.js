const clean = (value) => String(value ?? "").trim();

export const COURSE_ORIGINS = Object.freeze({
  ARCHIVE: "course-archive",
  CURRENT: "current-courses",
  SCHEDULE: "tournament-guide-schedule",
});

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function courseProfileHref({ courseId, origin, year, round } = {}) {
  const id = clean(courseId);
  if (!id) return null;
  const path = `/courses/${encodeURIComponent(id)}`;
  if (origin === COURSE_ORIGINS.ARCHIVE) {
    const yearNumber = Number(year);
    const roundNumber = Number(round);
    const context = Number.isInteger(yearNumber) && Number.isInteger(roundNumber)
      ? `&year=${yearNumber}&round=${roundNumber}`
      : "";
    return `${path}?view=archive&source=${COURSE_ORIGINS.ARCHIVE}${context}`;
  }
  if (origin === COURSE_ORIGINS.CURRENT) {
    return `${path}?source=${COURSE_ORIGINS.CURRENT}`;
  }
  if (origin === COURSE_ORIGINS.SCHEDULE) {
    return `${path}?source=${COURSE_ORIGINS.SCHEDULE}`;
  }
  return path;
}

export function courseOriginReturn(searchParams = {}) {
  const source = clean(first(searchParams?.source)).toLowerCase();
  const view = clean(first(searchParams?.view)).toLowerCase();
  if (source === COURSE_ORIGINS.ARCHIVE && view === "archive") {
    return {
      href: "/courses?view=archive",
      label: "Course Archive",
      accessibleLabel: "Back to Course Archive",
    };
  }
  if (source === COURSE_ORIGINS.CURRENT && !view) {
    return {
      href: "/courses",
      label: "Tournament Courses",
      accessibleLabel: "Back to Tournament Courses",
    };
  }
  if (source === COURSE_ORIGINS.SCHEDULE && !view) {
    return {
      href: "/tournament-guide/schedule",
      label: "Schedule",
      accessibleLabel: "Back to Schedule",
      placement: "below-hero",
    };
  }
  return null;
}
