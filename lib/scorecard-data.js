import "server-only";
import { cache } from "react";
import {
  loadCanonical2017To2022ScorecardSheets,
  loadCanonicalCareerScorecardSheets,
  loadCanonical2023ScorecardSheets,
  loadCanonical2024ScorecardSheets,
  loadScorecardSheets,
} from "./google-sheets-data";
import { buildScorecardAnalytics } from "./scorecard-analytics";
import { buildGhostMatchExclusionSet } from "./ghost-match";
import {
  buildCanonicalHistoryCourseHoleAliases,
  selectCanonical2024NetPresentationScorecards,
} from "./history-2024-net-projection";
import {
  buildCanonical2023ScorecardContextProjection,
  reconcileCanonical2023ScorecardPresentation,
  selectCanonical2023NetPresentationScorecards,
} from "./history-2023-projection";

const ANALYTICS_CACHE_MS = 5 * 60 * 1000;
let cachedAnalytics = null;
let cachedAt = 0;
let pendingAnalytics = null;
let cachedCanonical2017To2022Analytics = null;
let cachedCanonical2017To2022At = 0;
let pendingCanonical2017To2022Analytics = null;
let cachedCanonical2023Analytics = null;
let cachedCanonical2023At = 0;
let pendingCanonical2023Analytics = null;
let cachedCanonical2024Analytics = null;
let cachedCanonical2024At = 0;
let pendingCanonical2024Analytics = null;
let cachedCanonicalCareerAnalytics = null;
let cachedCanonicalCareerAt = 0;
let pendingCanonicalCareerAnalytics = null;

export function invalidateScorecardAnalyticsCache() {
  cachedAnalytics = null;
  cachedAt = 0;
  pendingAnalytics = null;
  cachedCanonical2017To2022Analytics = null;
  cachedCanonical2017To2022At = 0;
  pendingCanonical2017To2022Analytics = null;
  cachedCanonical2023Analytics = null;
  cachedCanonical2023At = 0;
  pendingCanonical2023Analytics = null;
  cachedCanonical2024Analytics = null;
  cachedCanonical2024At = 0;
  pendingCanonical2024Analytics = null;
  cachedCanonicalCareerAnalytics = null;
  cachedCanonicalCareerAt = 0;
  pendingCanonicalCareerAnalytics = null;
}

async function buildCachedCanonical2017To2022ScorecardAnalytics() {
  const now = Date.now();
  if (cachedCanonical2017To2022Analytics && now - cachedCanonical2017To2022At < ANALYTICS_CACHE_MS) {
    return cachedCanonical2017To2022Analytics;
  }
  if (pendingCanonical2017To2022Analytics) return pendingCanonical2017To2022Analytics;

  pendingCanonical2017To2022Analytics = (async () => {
    cachedCanonical2017To2022Analytics = await buildAnalytics(loadCanonical2017To2022ScorecardSheets);
    cachedCanonical2017To2022At = Date.now();
    return cachedCanonical2017To2022Analytics;
  })();

  try {
    return await pendingCanonical2017To2022Analytics;
  } finally {
    pendingCanonical2017To2022Analytics = null;
  }
}

async function buildAnalytics(loadSheets, {
  canonical2023 = false,
  canonical2024 = false,
  canonicalCareer = false,
} = {}) {
  const sheets = await loadSheets();
  const analytics = buildScorecardAnalytics({
    roundScorecards: sheets.roundScorecards,
    matches: sheets.matches,
    courseHoles: sheets.courseHoles,
    courses: sheets.courses,
    teamNames: sheets.teamNames,
    players: sheets.players,
  });
  const history2024NetProjection = canonical2024 || canonicalCareer
    ? buildCanonicalHistoryCourseHoleAliases({
      year: 2024,
      courses: sheets.courses,
      courseHoles: sheets.courseHoles,
    })
    : null;
  const history2024NetProjectionAnalytics = history2024NetProjection
    ? buildScorecardAnalytics({
      roundScorecards: sheets.roundScorecards,
      matches: sheets.matches,
      courseHoles: history2024NetProjection.courseHoles,
      courses: sheets.courses,
      teamNames: sheets.teamNames,
      players: sheets.players,
    })
    : null;
  const history2023Projection = canonical2023 || canonicalCareer
    ? buildCanonical2023ScorecardContextProjection({
      roundScorecards: sheets.roundScorecards,
      courses: sheets.courses,
      courseHoles: sheets.courseHoles,
    })
    : null;
  const history2023ProjectionAnalytics = history2023Projection
    ? buildScorecardAnalytics({
      roundScorecards: history2023Projection.projectedRoundScorecards,
      matches: sheets.matches,
      courseHoles: history2023Projection.courseHoles,
      courses: sheets.courses,
      teamNames: sheets.teamNames,
      players: sheets.players,
    })
    : null;
  const history2023NetProjectionScorecards = history2023ProjectionAnalytics?.scorecards.filter(
    (scorecard) => scorecard.year === 2023
  ) || [];
  const history2024NetProjectionScorecards = history2024NetProjectionAnalytics?.scorecards.filter(
    (scorecard) => scorecard.year === 2024
  ) || [];
  const canonicalCareerScorecards = canonicalCareer
    ? [
      ...analytics.scorecards.filter((scorecard) => ![2023, 2024].includes(Number(scorecard.year))),
      ...reconcileCanonical2023ScorecardPresentation({
        scorecards: [1, 2, 3].flatMap((round) =>
          selectCanonical2023NetPresentationScorecards({
            year: 2023,
            round,
            scorecards: analytics.scorecards,
            projectedScorecards: history2023NetProjectionScorecards,
          })
        ),
        matches: sheets.matches,
      }),
      ...[1, 2, 3].flatMap((round) =>
        selectCanonical2024NetPresentationScorecards({
          year: 2024,
          round,
          scorecards: analytics.scorecards,
          projectedScorecards: history2024NetProjectionScorecards,
        })
      ),
    ]
    : analytics.scorecards;
  return {
    ...analytics,
    canonicalCareerScorecards,
    history2023NetProjectionScorecards,
    history2023ProjectionAudit: history2023Projection?.audit || [],
    history2023TeeAudit: history2023Projection?.teeAudit || [],
    history2024NetProjectionScorecards,
    history2024NetProjectionAudit: history2024NetProjection?.audit || [],
    ghostMatchExclusions: buildGhostMatchExclusionSet(sheets.ghostMatches || []),
    ghostMatchRows: sheets.ghostMatches || [],
  };
}

async function buildCachedCanonicalCareerScorecardAnalytics() {
  const now = Date.now();
  if (cachedCanonicalCareerAnalytics && now - cachedCanonicalCareerAt < ANALYTICS_CACHE_MS) {
    return cachedCanonicalCareerAnalytics;
  }
  if (pendingCanonicalCareerAnalytics) return pendingCanonicalCareerAnalytics;

  pendingCanonicalCareerAnalytics = (async () => {
    cachedCanonicalCareerAnalytics = await buildAnalytics(
      loadCanonicalCareerScorecardSheets,
      { canonicalCareer: true }
    );
    cachedCanonicalCareerAt = Date.now();
    return cachedCanonicalCareerAnalytics;
  })();

  try {
    return await pendingCanonicalCareerAnalytics;
  } finally {
    pendingCanonicalCareerAnalytics = null;
  }
}

async function buildCachedCanonical2023ScorecardAnalytics() {
  const now = Date.now();
  if (cachedCanonical2023Analytics && now - cachedCanonical2023At < ANALYTICS_CACHE_MS) {
    return cachedCanonical2023Analytics;
  }
  if (pendingCanonical2023Analytics) return pendingCanonical2023Analytics;

  pendingCanonical2023Analytics = (async () => {
    cachedCanonical2023Analytics = await buildAnalytics(loadCanonical2023ScorecardSheets, { canonical2023: true });
    cachedCanonical2023At = Date.now();
    return cachedCanonical2023Analytics;
  })();

  try {
    return await pendingCanonical2023Analytics;
  } finally {
    pendingCanonical2023Analytics = null;
  }
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
    cachedCanonical2024Analytics = await buildAnalytics(loadCanonical2024ScorecardSheets, { canonical2024: true });
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
export const loadCanonical2017To2022ScorecardAnalytics = cache(buildCachedCanonical2017To2022ScorecardAnalytics);
export const loadCanonical2023ScorecardAnalytics = cache(buildCachedCanonical2023ScorecardAnalytics);
export const loadCanonical2024ScorecardAnalytics = cache(buildCachedCanonical2024ScorecardAnalytics);
export const loadCanonicalCareerScorecardAnalytics = cache(buildCachedCanonicalCareerScorecardAnalytics);
