export function safePlayerDirectoryReturnHref(value) {
  const fallback = "/players";
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  try {
    const url = new URL(raw, "https://sandbagger.local");
    if (url.origin !== "https://sandbagger.local") return fallback;
    if (url.pathname !== fallback) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export const COMPLETED_HISTORY_PLAYER_YEARS = Object.freeze([
  2017,
  2018,
  2019,
  2020,
  2021,
  2022,
  2023,
  2024,
  2025,
]);

const completedHistoryPlayerYearSet = new Set(COMPLETED_HISTORY_PLAYER_YEARS);

export function isCompletedHistoryPlayerYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && completedHistoryPlayerYearSet.has(year);
}

export function historicalPlayerProfileHref(slug, year) {
  if (!slug || !isCompletedHistoryPlayerYear(year)) return null;
  const query = new URLSearchParams({
    from: "history",
    year: String(Number(year)),
  });
  return `/players/${encodeURIComponent(String(slug))}?${query.toString()}`;
}

export function historicalPlayerReturnContext(searchParams = {}) {
  const from = Array.isArray(searchParams?.from)
    ? searchParams.from[0]
    : searchParams?.from;
  const rawYear = Array.isArray(searchParams?.year)
    ? searchParams.year[0]
    : searchParams?.year;
  if (String(from ?? "").trim().toLowerCase() !== "history") return null;
  if (!isCompletedHistoryPlayerYear(rawYear)) return null;

  const year = Number(rawYear);
  return {
    year,
    href: `/history/${year}`,
    label: `${year} Tournament`,
    accessibleLabel: `Back to ${year} Tournament`,
  };
}

export function playerDirectoryHref(searchParams = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "returnTo") continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined && item !== null && String(item)) {
        query.append(key, String(item));
      }
    }
  }

  const serialized = query.toString();
  return serialized ? `/players?${serialized}` : "/players";
}
