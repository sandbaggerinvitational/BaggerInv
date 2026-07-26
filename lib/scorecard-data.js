import "server-only";
import { cache } from "react";
import { loadScorecardSheets } from "./google-sheets-data";
import { buildScorecardAnalytics } from "./scorecard-analytics";

const ANALYTICS_CACHE_MS = 5 * 60 * 1000;
let cachedAnalytics = null;
let cachedAt = 0;
let pendingAnalytics = null;

export function invalidateScorecardAnalyticsCache() {
  cachedAnalytics = null;
  cachedAt = 0;
  pendingAnalytics = null;
}

async function buildCachedScorecardAnalytics() {
  const now = Date.now();
  if (cachedAnalytics && now - cachedAt < ANALYTICS_CACHE_MS) return cachedAnalytics;
  if (pendingAnalytics) return pendingAnalytics;

  pendingAnalytics = (async () => {
    const sheets = await loadScorecardSheets();
    const analytics = buildScorecardAnalytics({
      roundScorecards: sheets.roundScorecards,
      matches: sheets.matches,
      courseHoles: sheets.courseHoles,
      courses: sheets.courses,
      teamNames: sheets.teamNames,
      players: sheets.players,
    });
    cachedAnalytics = analytics;
    cachedAt = Date.now();
    return analytics;
  })();

  try {
    return await pendingAnalytics;
  } finally {
    pendingAnalytics = null;
  }
}

/**
 * Server-only loader for the shared scorecard analytics foundation.
 * React cache deduplicates within one render; the short server cache avoids
 * rebuilding the full archive on every page request in a warm Vercel function.
 */
export const loadScorecardAnalytics = cache(buildCachedScorecardAnalytics);
