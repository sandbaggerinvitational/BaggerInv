import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import {
  loadCanonical2017To2022ScorecardSheets,
  loadCanonicalCareerScorecardSheets,
  loadCanonical2023ScorecardSheets,
  loadCanonical2024ScorecardSheets,
  loadScorecardSheets,
  SPREADSHEET_ID,
} from "./google-sheets-data";
import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment";
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
import { COMPLETED_CAREER_HISTORY_YEARS } from "./career-history-authority";
import {
  createVersionedHistoricalAnalyticsLoader,
  frozenScorecardAnalyticsInput,
  historicalAnalyticsDescriptor,
  historicalAnalyticsSourceHealth,
  historicalAnalyticsSourceNamespace,
  HISTORICAL_ANALYTICS_CACHE_TAG,
} from "./historical-analytics-reuse";

const sourceNamespace = historicalAnalyticsSourceNamespace({
  sourceIdentities: [SPREADSHEET_ID, PRODUCTION_SPREADSHEET_ID],
});
const diagnostics = {
  cacheLookups: 0,
  durableBuilds: 0,
  durableHits: 0,
  sourceBypasses: 0,
};

async function readThroughNextDataCache({ descriptor, buildEnvelope, cacheSlot = "primary" }) {
  let built = false;
  const read = unstable_cache(
    async () => {
      built = true;
      diagnostics.durableBuilds += 1;
      return buildEnvelope();
    },
    [descriptor.key, cacheSlot],
    {
      revalidate: false,
      tags: [HISTORICAL_ANALYTICS_CACHE_TAG],
    }
  );
  diagnostics.cacheLookups += 1;
  const envelope = await read();
  if (!built) diagnostics.durableHits += 1;
  return envelope;
}

const loadVersionedHistoricalAnalytics = createVersionedHistoricalAnalyticsLoader({
  readThrough: readThroughNextDataCache,
});

function completedGhostRows(sheets, frozenInput) {
  const completedYears = new Set(COMPLETED_CAREER_HISTORY_YEARS.map(Number));
  const completedMatchIds = new Set(frozenInput.matches.map((match) =>
    String(match?.["Match ID"] || match?.matchId || "").trim()
  ).filter(Boolean));
  return (Array.isArray(sheets.ghostMatches) ? sheets.ghostMatches : []).filter((row) => {
    const year = Number(row?.Year ?? row?.year);
    const matchId = String(row?.["Match ID"] || row?.matchId || "").trim();
    return Number.isInteger(year)
      ? completedYears.has(year)
      : !matchId || completedMatchIds.has(matchId);
  });
}

async function reusableScorecardPass(input, sourceHealth) {
  const descriptor = historicalAnalyticsDescriptor({
    input,
    completedYears: COMPLETED_CAREER_HISTORY_YEARS,
    sourceNamespace,
    sourceMode: sourceHealth.sourceMode,
  });
  if (!sourceHealth.reusable) diagnostics.sourceBypasses += 1;
  return loadVersionedHistoricalAnalytics({
    descriptor,
    sourceReusable: sourceHealth.reusable,
    build: () => buildScorecardAnalytics(input),
  });
}

async function buildAnalytics(loadSheets, {
  canonical2023 = false,
  canonical2024 = false,
  canonicalCareer = false,
} = {}) {
  const sheets = await loadSheets();
  const sourceHealth = historicalAnalyticsSourceHealth(sheets);
  const frozen = frozenScorecardAnalyticsInput(sheets);
  const analytics = await reusableScorecardPass(frozen, sourceHealth);
  const history2024NetProjection = canonical2024 || canonicalCareer
    ? buildCanonicalHistoryCourseHoleAliases({
      year: 2024,
      courses: frozen.courses,
      courseHoles: frozen.courseHoles,
    })
    : null;
  const history2024NetProjectionAnalytics = history2024NetProjection
    ? await reusableScorecardPass({
      ...frozen,
      courseHoles: history2024NetProjection.courseHoles,
    }, sourceHealth)
    : null;
  const history2023Projection = canonical2023 || canonicalCareer
    ? buildCanonical2023ScorecardContextProjection({
      roundScorecards: frozen.roundScorecards,
      courses: frozen.courses,
      courseHoles: frozen.courseHoles,
    })
    : null;
  const history2023ProjectionAnalytics = history2023Projection
    ? await reusableScorecardPass({
      ...frozen,
      roundScorecards: history2023Projection.projectedRoundScorecards,
      courseHoles: history2023Projection.courseHoles,
    }, sourceHealth)
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
        matches: frozen.matches,
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
  const ghostMatchRows = completedGhostRows(sheets, frozen);
  return {
    ...analytics,
    canonicalCareerScorecards,
    history2023NetProjectionScorecards,
    history2023ProjectionAudit: history2023Projection?.audit || [],
    history2023TeeAudit: history2023Projection?.teeAudit || [],
    history2024NetProjectionScorecards,
    history2024NetProjectionAudit: history2024NetProjection?.audit || [],
    ghostMatchExclusions: buildGhostMatchExclusionSet(ghostMatchRows),
    ghostMatchRows,
  };
}

async function buildCanonical2017To2022ScorecardAnalytics() {
  return buildAnalytics(loadCanonical2017To2022ScorecardSheets);
}

async function buildCanonicalCareerScorecardAnalytics() {
  return buildAnalytics(loadCanonicalCareerScorecardSheets, { canonicalCareer: true });
}

async function buildCanonical2023ScorecardAnalytics() {
  return buildAnalytics(loadCanonical2023ScorecardSheets, { canonical2023: true });
}

async function buildScorecardAnalyticsProduct() {
  return buildAnalytics(loadScorecardSheets);
}

async function buildCanonical2024ScorecardAnalytics() {
  return buildAnalytics(loadCanonical2024ScorecardSheets, { canonical2024: true });
}

/**
 * Live/current invalidation deliberately does not evict completed History.
 * Source corrections produce a new content fingerprint; analytics changes
 * require the explicit domain-version bump guarded by tests.
 */
export function invalidateScorecardAnalyticsCache() {}

export function scorecardAnalyticsReuseDiagnostics() {
  return Object.freeze({ ...diagnostics });
}

export const loadScorecardAnalytics = cache(buildScorecardAnalyticsProduct);
export const loadCanonical2017To2022ScorecardAnalytics = cache(buildCanonical2017To2022ScorecardAnalytics);
export const loadCanonical2023ScorecardAnalytics = cache(buildCanonical2023ScorecardAnalytics);
export const loadCanonical2024ScorecardAnalytics = cache(buildCanonical2024ScorecardAnalytics);
export const loadCanonicalCareerScorecardAnalytics = cache(buildCanonicalCareerScorecardAnalytics);
