const clean = (value) => String(value ?? "").trim();

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
  if (year !== "2025") return null;
  return {
    href: "/history/2025",
    label: "2025 Tournament",
  };
}
