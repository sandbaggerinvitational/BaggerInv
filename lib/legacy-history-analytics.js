import "server-only";

import { buildScorecardAnalytics } from "./scorecard-analytics.js";
import { loadScorecardAnalytics } from "./scorecard-data.js";

const unavailableLegacyAnalytics = Object.freeze(buildScorecardAnalytics());

/**
 * Older History remains on its legacy delivery path. Scorecard analytics are
 * useful supporting content, but a legacy workbook outage must not suppress
 * the bundled tournament archive, champions, courses, rounds, or awards.
 */
export async function loadLegacyHistoryAnalytics() {
  try {
    return await loadScorecardAnalytics();
  } catch (error) {
    console.warn("Legacy History scorecard analytics unavailable; rendering the historical archive without optional scoring statistics.", {
      reason: error?.message || String(error),
    });
    return unavailableLegacyAnalytics;
  }
}
