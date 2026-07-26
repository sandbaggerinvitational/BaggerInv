import "server-only";
import { cache } from "react";
import { loadPredictionSheets } from "./prediction-data";
import { buildScorecardAnalytics } from "./scorecard-analytics";

/**
 * Server-only loader for the shared scorecard analytics foundation.
 * Keeping loading separate leaves the calculations pure and fixture-testable.
 */
export const loadScorecardAnalytics = cache(async () => {
  const sheets = await loadPredictionSheets();
  return buildScorecardAnalytics({
    roundScorecards: sheets.roundScorecards,
    matches: sheets.matches,
    courseHoles: sheets.holes,
    courses: sheets.courses,
    teamNames: sheets.teamNames,
  });
});
