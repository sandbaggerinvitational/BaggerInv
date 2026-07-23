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
