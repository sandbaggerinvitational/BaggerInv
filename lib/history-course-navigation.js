const clean = (value) => String(value ?? "").trim();

export function isCompletedHistoryYear(value) {
  const year = Number(clean(value));
  return Number.isInteger(year) && year >= 2017 && year <= 2025;
}

function isHistoryNavigationYear(value) {
  const year = Number(clean(value));
  return Number.isInteger(year) && year >= 2017 && year <= 2026;
}

export function historyCourseProfileHref({ courseId, year, round }) {
  const id = clean(courseId);
  const roundNumber = Number(round);
  if (!id || !isHistoryNavigationYear(year)) return null;
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 3) return null;
  const context = `source=history&year=${Number(year)}&round=${roundNumber}`;
  return isCompletedHistoryYear(year)
    ? `/courses/${encodeURIComponent(id)}?view=archive&${context}`
    : `/courses/${encodeURIComponent(id)}?${context}`;
}

export function historyCourseReturn(searchParams = {}) {
  if (clean(searchParams.source).toLowerCase() !== "history") return null;
  const year = clean(searchParams.year);
  if (!/^\d{4}$/.test(year)) return null;
  const round = Number(searchParams.round);
  if (Number.isInteger(round) && round >= 1 && round <= 3) {
    return {
      href: `/history/${year}/round/${round}`,
      label: `Back to ${year} Round ${round}`,
    };
  }
  return {
    href: `/history/${year}`,
    label: `Back to ${year} History`,
  };
}

export function historyCourseTournamentReturn(searchParams = {}) {
  if (clean(searchParams.source).toLowerCase() !== "history") return null;
  const year = clean(searchParams.year);
  if (!isHistoryNavigationYear(year)) return null;
  return {
    href: `/history/${year}`,
    label: `${year} Tournament`,
  };
}
