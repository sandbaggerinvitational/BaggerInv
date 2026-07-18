import { cache } from "react";
import { SPREADSHEET_ID } from "./google-sheets-data";

const SHEETS = {
  players: "Players",
  matches: "Matches",
  liveTournaments: "Live Tournaments",
  liveRoundHandicaps: "Live Round Handicaps",
  tournamentRules: "Tournament Rules",
  courses: "Courses",
  handicaps: "Handicaps",
  scorecards: "Course Scorecards",
  holes: "Course Holes",
  settings: "Prediction Settings",
};

function clean(value) { return String(value ?? "").trim(); }
function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}
function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]; const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function toObjects(rows) {
  const headers = (rows[0] || []).map(clean);
  return rows.slice(1).filter((row) => row.some((v) => clean(v))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))
  );
}
async function fetchSheet(sheetName, optional = false) {
  try {
    const response = await fetch(csvUrl(sheetName), { cache: "no-store" });
    if (!response.ok) throw new Error(`${sheetName} returned ${response.status}`);
    const text = await response.text();
    if (!text.trim() || text.trim().startsWith("<")) throw new Error(`${sheetName} is not public`);
    return toObjects(parseCsv(text));
  } catch (error) {
    if (optional) return [];
    throw error;
  }
}

export const loadPredictionSheets = cache(async () => {
  const entries = await Promise.all(Object.entries(SHEETS).map(async ([key, name]) => [
    key,
    await fetchSheet(name, ["scorecards", "holes", "settings"].includes(key)),
  ]));
  return Object.fromEntries(entries);
});
