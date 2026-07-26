import "server-only";
import { cache } from "react";
import { loadScorecardSheets } from "./google-sheets-data";
import { buildScorecardAnalytics } from "./scorecard-analytics";

/**
 * Server-only loader for the shared scorecard analytics foundation.
 * Keeping loading separate leaves the calculations pure and fixture-testable.
 */
export const loadScorecardAnalytics = cache(async () => {
  const sheets = await loadScorecardSheets();
  return buildScorecardAnalytics({
    roundScorecards: sheets.roundScorecards,
    matches: sheets.matches,
    courseHoles: sheets.courseHoles,
    courses: sheets.courses,
    teamNames: sheets.teamNames,
    players: sheets.players,
  });
});
