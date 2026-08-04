import { cache } from "react";
import { SPREADSHEET_ID } from "./google-sheets-data";
import { readWorkbookSheetTitles, readWorkbookSheetsByName } from "./google-sheets-write";

export const PREDICTION_SHEETS = {
  tournaments: { label: "Tournaments", aliases: ["Tournaments"], required: true },
  players: { label: "Players", aliases: ["Players"], required: true },
  matches: { label: "Matches", aliases: ["Matches"], required: true },
  liveMatches: { label: "Live Matches", aliases: ["Live Matches"], required: true },
  teamNames: { label: "Team Names", aliases: ["Team Names"], required: true },
  liveTournaments: { label: "Live Tournaments", aliases: ["Live Tournaments"], required: true },
  liveRoundHandicaps: { label: "Live Round Handicaps", aliases: ["Live Round Handicaps"], required: true },
  tournamentRules: { label: "Tournament Rules", aliases: ["Tournament Rules"], required: true },
  courses: { label: "Courses", aliases: ["Courses"], required: true },
  handicaps: { label: "Handicaps", aliases: ["Handicaps"], required: true },
  scorecards: { label: "Course Scorecards", aliases: ["Course Scorecards", "Course Scorecard"], required: true },
  holes: { label: "Course Holes", aliases: ["Course Holes", "Course Hole"], required: false },
  roundScorecards: { label: "Round Scorecards", aliases: ["Round Scorecards"], required: false },
  ghostMatches: { label: "Ghost Match", aliases: ["Ghost Match"], required: false },
  settings: { label: "Prediction Settings", aliases: ["Prediction Settings", "Prediction Setting"], required: true },
  draftSettings: { label: "Draft Settings", aliases: ["Draft Settings"], required: false },
  draftPicks: { label: "Draft Picks", aliases: ["Draft Picks"], required: false },
};

const clean = (value) => String(value ?? "").trim();
const normalizeSheetName = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const loadLogicalWorkbook = cache(async () => {
  const titles = await readWorkbookSheetTitles();
  const titleByLogicalName = new Map(titles.map((title) => [normalizeSheetName(title), title]));
  const matches = Object.fromEntries(Object.entries(PREDICTION_SHEETS).map(([key, config]) => [
    key,
    config.aliases.map((alias) => titleByLogicalName.get(normalizeSheetName(alias))).find(Boolean) || null,
  ]));
  const selectedTitles = [...new Set(Object.values(matches).filter(Boolean))];
  const sheets = selectedTitles.length ? await readWorkbookSheetsByName(selectedTitles) : {};
  return Object.fromEntries(Object.entries(PREDICTION_SHEETS).map(([key, config]) => {
    const matchedName = matches[key];
    const sheet = matchedName ? sheets[matchedName] : null;
    return [key, {
      headers: sheet?.headers || [],
      rows: (sheet?.records || []).map(({ record }) => record),
      matchedName,
      source: matchedName ? "authenticated-name" : null,
      attempts: config.aliases.map((alias) => ({
        source: "authenticated-name",
        value: alias,
        ok: Boolean(matchedName && normalizeSheetName(alias) === normalizeSheetName(matchedName)),
        ...(matchedName ? {} : { error: "Logical worksheet name not found" }),
      })),
    }];
  }));
});

async function fetchSheetDetailed(config) {
  const workbook = await loadLogicalWorkbook();
  const key = Object.keys(PREDICTION_SHEETS).find((candidate) => PREDICTION_SHEETS[candidate] === config);
  return workbook[key] || { headers: [], rows: [], matchedName: null, source: null, attempts: [] };
}

async function fetchSheet(config) {
  const result = await fetchSheetDetailed(config);
  if (result.headers.length) return result.rows;
  if (!config.required) return [];
  const lastError = [...result.attempts].reverse().find((attempt) => attempt.error)?.error;
  throw new Error(`${config.label} could not be loaded${lastError ? `: ${lastError}` : ""}.`);
}

export const loadPredictionSheets = cache(async () => {
  const entries = await Promise.all(
    Object.entries(PREDICTION_SHEETS).map(async ([key, config]) => [key, await fetchSheet(config)])
  );
  return Object.fromEntries(entries);
});

export const loadPredictionDiagnostics = cache(async () => {
  const checkedAt = new Date().toISOString();
  const entries = await Promise.all(
    Object.entries(PREDICTION_SHEETS).map(async ([key, config]) => {
      const result = await fetchSheetDetailed(config);
      return [key, {
        key,
        label: config.label,
        required: config.required,
        aliases: config.aliases,
        status: result.headers.length ? (result.rows.length ? "healthy" : "warning") : (config.required ? "error" : "warning"),
        rowCount: result.rows.length,
        headers: result.headers,
        matchedName: result.matchedName,
        source: result.source,
        attempts: result.attempts,
        rows: result.rows,
      }];
    })
  );
  return { checkedAt, spreadsheetId: SPREADSHEET_ID, sheets: Object.fromEntries(entries) };
});
