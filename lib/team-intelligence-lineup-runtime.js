import { optimizeLineups } from "./lineup-optimizer.js";
import { formatCode, pick, settingsMap } from "./prediction-engine.js";
import {
  getCourseOptions,
  getFormatCourse,
  scorecardForTee,
} from "./tournament-context.js";

const LINEUP_FORMATS = Object.freeze(["BB", "SC"]);
const clean = (value) => String(value ?? "").trim();

function formatContext(sheets, year, format) {
  const course = getFormatCourse(sheets, year, format);
  const scorecards = getCourseOptions(sheets, course);
  const assignedTee = clean(pick(course, "Tee", "Tee Name"));
  const scorecard = scorecardForTee(scorecards, assignedTee);
  const values = {
    rating: pick(scorecard, "Course Rating", "Rating"),
    slope: pick(scorecard, "Slope Rating", "Slope"),
    par: pick(scorecard, "Par"),
  };
  return {
    complete: Boolean(clean(values.rating) && clean(values.slope) && clean(values.par)),
    values,
  };
}
/**
 * Build the two partnership-format optimizer results once for one stable set
 * of Lineup Lab inputs. Selection stays a constant-time lookup so changing
 * the visible format does not rerun either optimizer.
 */
export function buildTeamIntelligenceLineupRuntime({
  sheets = {},
  year,
  teams,
  historical = {},
  partnershipPredictionMap = {},
  headToHead = {},
  optimizer = optimizeLineups,
} = {}) {
  const settings = settingsMap(sheets.settings || []);
  const readinessByFormat = {};
  const optimizersByFormat = Object.fromEntries(LINEUP_FORMATS.map((format) => {
    const context = formatContext(sheets, year, format);
    readinessByFormat[format] = context.complete;
    return [format, context.complete ? optimizer({
      format,
      team1: teams.team1,
      team2: teams.team2,
      scorecard: context.values,
      historical,
      partnerships: partnershipPredictionMap,
      headToHead,
      settings,
    }) : null];
  }));

  return Object.freeze({
    optimizersByFormat: Object.freeze(optimizersByFormat),
    readinessByFormat: Object.freeze(readinessByFormat),
    optimizerFor(format) {
      return optimizersByFormat[formatCode(format)] || null;
    },
    isReady(format) {
      return Boolean(readinessByFormat[formatCode(format)]);
    },
  });
}
