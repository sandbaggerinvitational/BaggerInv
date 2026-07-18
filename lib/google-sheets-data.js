import { cache } from "react";

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

const BOOLEAN_HEADERS = new Set([
  "Active",
  "Captain Eligible",
  "Board of Governors",
  "Front 9 Used",
  "Back 9 Used",
  "Overall Used",
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
    const numeric = Number(normalized.replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : normalized;
  }

  return normalized;
}

function rowsToObjects(rows) {
  const headers = (rows[0] || []).map(clean);

  return rows
    .slice(1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          convertValue(header, row[index]),
        ])
      )
    );
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

  return rowsToObjects(parseCsv(text));
}

export const loadHistoricalData = cache(async () => {
  const entries = await Promise.all(
    Object.entries(HISTORICAL_SHEETS).map(async ([key, sheetName]) => [
      key,
      await fetchSheet(sheetName),
    ])
  );

  return Object.fromEntries(entries);
});
