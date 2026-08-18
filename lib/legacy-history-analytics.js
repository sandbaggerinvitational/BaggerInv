import "server-only";

import { buildScorecardAnalytics } from "./scorecard-analytics.js";
import {
  loadCanonical2017To2022ScorecardAnalytics,
  loadCanonical2023ScorecardAnalytics,
  loadCanonical2024ScorecardAnalytics,
  loadScorecardAnalytics,
} from "./scorecard-data.js";

const unavailableLegacyAnalytics = Object.freeze(buildScorecardAnalytics());

export async function loadCanonical2017To2022HistoryAnalytics() {
  try {
    return await loadCanonical2017To2022ScorecardAnalytics();
  } catch (error) {
    console.warn("Canonical 2017–2022 History scorecard analytics unavailable; rendering the reconciled archive without optional scoring statistics.", {
      reason: error?.message || String(error),
    });
    return unavailableLegacyAnalytics;
  }
}

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

export async function loadCanonical2024HistoryAnalytics() {
  try {
    return await loadCanonical2024ScorecardAnalytics();
  } catch (error) {
    console.warn("Canonical legacy History scorecard analytics unavailable; rendering the historical archive without optional scoring statistics.", {
      reason: error?.message || String(error),
    });
    return unavailableLegacyAnalytics;
  }
}

export async function loadCanonical2023HistoryAnalytics() {
  try {
    return await loadCanonical2023ScorecardAnalytics();
  } catch (error) {
    console.warn("Canonical 2023 History scorecard analytics unavailable; rendering the historical archive without optional scoring statistics.", {
      reason: error?.message || String(error),
    });
    return unavailableLegacyAnalytics;
  }
}
