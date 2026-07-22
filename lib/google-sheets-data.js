import { cache } from "react";
import { parseNumericValue } from "./formatters";

export const SPREADSHEET_ID =
  "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";

const HISTORICAL_SHEETS = {
  players: "Players",
  tournaments: "Tournaments",
  teamNames: "Team Names",
  matches: "Matches",
  rounds: "Rounds",
  rules: "Tournament Rules",
  awards: "Awards",
  courses: "Courses",
  handicaps: "Handicaps",
};

export const GUIDE_SHEETS = {
  sections: "Guide Sections",
  rules: "Rule Book",
  itinerary: "Tournament Itinerary",
  information: "Guide Information",
};

const BOOLEAN_HEADERS = new Set([
  "Active",
  "Captain Eligible",
  "Board of Governors",
  "Rookie",
  "Handicap Committee",
  "Captain",
  "Countdown Enabled",
  "Front 9 Used",
  "Back 9 Used",
  "Overall Used",
  "Important",
  "Featured",
  "Sensitive",
]);

const NUMBER_HEADERS = new Set([
  "Year",
  "First Year",
  "Team Size",
  "Round",
  "Match",
  "Points Available",
  "Front 9 Points",
  "Back 9 Points",
  "Overall Points",
  "Team 1 Player 1 Playing HCP",
  "Team 1 Player 1 Stroke",
  "Team 1 Player 2 Playing HCP",
  "Team 1 Player 2 Stroke",
  "Team 1 Playing HCP",
  "Team 1 Stroke",
  "Team 2 Player 1 Playing HCP",
  "Team 2 Player 1 Stroke",
  "Team 2 Player 2 Playing HCP",
  "Team 2 Player 2 Stroke",
  "Team 2 Playing HCP",
  "Team 2 Stroke",
  "Team 1 Points",
  "Team 2 Points",
  "Slope",
  "Rating",
  "Yardage",
  "Par",
  "Year Opened",
  "Tournament Handicap",
  "Display Order",
]);

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}`;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function clean(value) {
  return String(value ?? "").trim();
}

function convertValue(header, value) {
  const normalized = clean(value);
  if (!normalized) return null;

  if (BOOLEAN_HEADERS.has(header)) {
    return ["true", "yes", "y", "1"].includes(normalized.toLowerCase());
  }

  if (NUMBER_HEADERS.has(header)) {
    const numeric = parseNumericValue(normalized);
    return numeric !== null ? numeric : normalized;
  }

  return normalized;
}

function rowsToObjects(rows, sheetName) {
  const headers = (rows[0] || []).map(clean);

  if (!headers.length || !headers.some(Boolean)) {
    throw new Error(`${sheetName} has no readable header row.`);
  }

  return rows
    .slice(1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row, rowIndex) => {
      const record = Object.fromEntries(
        headers.map((header, index) => [
          header,
          convertValue(header, row[index]),
        ])
      );
      Object.defineProperties(record, {
        __sheetName: { value: sheetName, enumerable: false },
        __sheetRow: { value: rowIndex + 2, enumerable: false },
      });
      return record;
    });
}

async function fetchSheet(sheetName) {
  const response = await fetch(csvUrl(sheetName), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${sheetName} returned HTTP ${response.status}.`);
  }

  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed || trimmed.startsWith("<")) {
    throw new Error(`${sheetName} did not return public CSV data.`);
  }

  try {
    return rowsToObjects(parseCsv(text), sheetName);
  } catch (error) {
    console.error("Google Sheet parsing failed", {
      sheet: sheetName,
      reason: error?.message || String(error),
    });
    throw error;
  }
}

export const loadHistoricalData = cache(async () => {
  const entries = await Promise.all(
    Object.entries(HISTORICAL_SHEETS).map(async ([key, sheetName]) => {
      try {
        return [key, await fetchSheet(sheetName)];
      } catch (error) {
        console.error("Historical sheet load failed", {
          sheet: sheetName,
          key,
          reason: error?.message || String(error),
        });
        throw error;
      }
    })
  );

  return Object.fromEntries(entries);
});

export const loadTournamentGuideSheets = cache(async () => {
  const entries = await Promise.all(
    Object.entries(GUIDE_SHEETS).map(async ([key, sheetName]) => {
      try {
        return [key, await fetchSheet(sheetName)];
      } catch (error) {
        console.warn("Tournament Guide sheet unavailable", {
          sheet: sheetName,
          reason: error?.message || String(error),
        });
        return [key, []];
      }
    })
  );
  return Object.fromEntries(entries);
});
