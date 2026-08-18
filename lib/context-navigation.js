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
const internalNavigationOrigin = "https://sandbagger.local";
const canonicalPlayerSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function firstSearchParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function canonicalPlayerSlug(value) {
  const slug = String(value ?? "").trim().toLowerCase();
  return canonicalPlayerSlugPattern.test(slug) ? slug : "";
}

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
  const from = firstSearchParam(searchParams?.from);
  const rawYear = firstSearchParam(searchParams?.year);
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

export function playerOriginSlug(searchParams = {}) {
  const from = firstSearchParam(searchParams?.from);
  if (String(from ?? "").trim().toLowerCase() !== "player") return "";
  return canonicalPlayerSlug(firstSearchParam(searchParams?.player));
}

export function withPlayerOriginContext(href, slug) {
  const player = canonicalPlayerSlug(slug);
  const rawHref = String(href ?? "").trim();
  if (!player || !rawHref.startsWith("/") || rawHref.startsWith("//")) return rawHref || null;

  try {
    const url = new URL(rawHref, internalNavigationOrigin);
    if (url.origin !== internalNavigationOrigin) return rawHref;
    url.searchParams.set("from", "player");
    url.searchParams.set("player", player);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawHref;
  }
}

export function playerOriginReturnContext(searchParams = {}, resolvePlayer) {
  const requestedSlug = playerOriginSlug(searchParams);
  if (!requestedSlug || typeof resolvePlayer !== "function") return null;

  let player;
  try {
    player = resolvePlayer(requestedSlug);
  } catch {
    return null;
  }

  const slug = canonicalPlayerSlug(player?.slug || player?.Slug);
  const name = String(player?.["Display Name"] || player?.name || "").trim();
  if (!slug || slug !== requestedSlug || !name) return null;

  return {
    slug,
    playerId: String(player?.["Player ID"] || player?.id || "").trim(),
    name,
    href: `/players/${encodeURIComponent(slug)}`,
    label: `${name} Profile`,
    accessibleLabel: `Back to ${name} Profile`,
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
