const buckets = new Map();

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 60_000;

export function consumeRateLimit(
  key,
  { limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS, now = Date.now() } = {}
) {
  const safeKey = String(key || "anonymous");
  const current = buckets.get(safeKey);

  if (!current || now >= current.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(safeKey, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
  }

  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function clientAddress(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
