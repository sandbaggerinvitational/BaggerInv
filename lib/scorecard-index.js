const clean = (value) => String(value ?? "").trim();

/**
 * Build the match lookup once for consumers that render many scorecards from
 * the same canonical collection. Array order is retained exactly so this is a
 * presentation-neutral replacement for repeatedly filtering the collection.
 */
export function indexScorecardsByMatch(scorecards = [], { matchIds } = {}) {
  const allowed = matchIds
    ? new Set([...matchIds].map(clean).filter(Boolean))
    : null;
  const index = new Map();

  for (const scorecard of scorecards) {
    const matchId = clean(scorecard?.matchId);
    if (!matchId || (allowed && !allowed.has(matchId))) continue;
    if (!index.has(matchId)) index.set(matchId, []);
    index.get(matchId).push(scorecard);
  }

  return index;
}
