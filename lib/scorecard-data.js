import "server-only";
import { cache } from "react";
import {
  loadCanonical2024ScorecardSheets,
  loadScorecardSheets,
} from "./google-sheets-data";
import { buildScorecardAnalytics } from "./scorecard-analytics";
import { buildGhostMatchExclusionSet } from "./ghost-match";

const ANALYTICS_CACHE_MS = 5 * 60 * 1000;
let cachedAnalytics = null;
let cachedAt = 0;
let pendingAnalytics = null;
let cachedCanonical2024Analytics = null;
let cachedCanonical2024At = 0;
let pendingCanonical2024Analytics = null;

export function invalidateScorecardAnalyticsCache() {
  cachedAnalytics = null;
  cachedAt = 0;
  pendingAnalytics = null;
  cachedCanonical2024Analytics = null;
  cachedCanonical2024At = 0;
  pendingCanonical2024Analytics = null;
}

async function buildAnalytics(loadSheets) {
  const sheets = await loadSheets();
  const analytics = buildScorecardAnalytics({
    roundScorecards: sheets.roundScorecards,
    matches: sheets.matches,
    courseHoles: sheets.courseHoles,
    courses: sheets.courses,
    teamNames: sheets.teamNames,
    players: sheets.players,
  });
  return {
    ...analytics,
    ghostMatchExclusions: buildGhostMatchExclusionSet(sheets.ghostMatches || []),
    ghostMatchRows: sheets.ghostMatches || [],
  };
}

async function buildCachedScorecardAnalytics() {
  const now = Date.now();
  if (cachedAnalytics && now - cachedAt < ANALYTICS_CACHE_MS) return cachedAnalytics;
  if (pendingAnalytics) return pendingAnalytics;

  pendingAnalytics = (async () => {
    cachedAnalytics = await buildAnalytics(loadScorecardSheets);
    cachedAt = Date.now();
    return cachedAnalytics;
  })();

  try {
    return await pendingAnalytics;
  } finally {
    pendingAnalytics = null;
  }
}

async function buildCachedCanonical2024ScorecardAnalytics() {
  const now = Date.now();
  if (cachedCanonical2024Analytics && now - cachedCanonical2024At < ANALYTICS_CACHE_MS) {
    return cachedCanonical2024Analytics;
  }
  if (pendingCanonical2024Analytics) return pendingCanonical2024Analytics;

  pendingCanonical2024Analytics = (async () => {
    cachedCanonical2024Analytics = await buildAnalytics(loadCanonical2024ScorecardSheets);
    cachedCanonical2024At = Date.now();
    return cachedCanonical2024Analytics;
  })();

  try {
    return await pendingCanonical2024Analytics;
  } finally {
    pendingCanonical2024Analytics = null;
  }
}

/**
 * Server-only loader for the shared scorecard analytics foundation.
 * React cache deduplicates within one render; the short server cache avoids
 * rebuilding the full archive on every page request in a warm Vercel function.
 */
export const loadScorecardAnalytics = cache(buildCachedScorecardAnalytics);
export const loadCanonical2024ScorecardAnalytics = cache(buildCachedCanonical2024ScorecardAnalytics);
