const clean = (value) => String(value ?? "").trim();

export function mergeRowsByStableMatchId(rows = [], allowedIds = null) {
  const allowed = allowedIds ? new Set([...allowedIds].map(clean)) : null;
  const matches = new Map();

  for (const row of rows) {
    const matchId = clean(row?.["Match ID"]);
    if (!matchId || (allowed && !allowed.has(matchId))) continue;
    const merged = { ...(matches.get(matchId) || {}) };
    for (const [field, value] of Object.entries(row || {})) {
      if (clean(value)) merged[field] = value;
    }
    matches.set(matchId, merged);
  }

  return matches;
}

export function mergeOriginalAssignmentWithLiveResult({
  matchId,
  permanentRows = [],
  liveRows = [],
} = {}) {
  const id = clean(matchId);
  if (!id) return {};
  const allowed = new Set([id]);
  const permanent = mergeRowsByStableMatchId(permanentRows, allowed).get(id) || {};
  const live = mergeRowsByStableMatchId(liveRows, allowed).get(id) || {};
  const merged = { ...permanent };
  for (const [field, value] of Object.entries(live)) {
    if (clean(value)) merged[field] = value;
  }
  return merged;
}
