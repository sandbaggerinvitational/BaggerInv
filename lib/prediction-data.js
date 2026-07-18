import { cache } from "react";
import { SPREADSHEET_ID } from "./google-sheets-data";

const SHEETS = {
  players: ["Players"],
  matches: ["Matches"],
  teamNames: ["Team Names"],
  liveTournaments: ["Live Tournaments"],
  liveRoundHandicaps: ["Live Round Handicaps"],
  tournamentRules: ["Tournament Rules"],
  courses: ["Courses"],
  handicaps: ["Handicaps"],
  scorecards: ["Course Scorecards", "Course Scorecard"],
  holes: ["Course Holes", "Course Hole"],
  settings: ["Prediction Settings", "Prediction Setting"],
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

function csvUrlByName(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}`;
}

function csvUrlByGid(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
    gid
  )}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toObjects(rows) {
  const headers = (rows[0] || []).map(clean);
  if (!headers.some(Boolean)) return [];

  return rows
    .slice(1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, clean(row[index])])
      )
    );
}

async function fetchCsv(url, label) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);

  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    throw new Error(`${label} did not return public CSV data`);
  }
  return toObjects(parseCsv(text));
}

function decodeHtml(value) {
  return clean(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Published Google Sheets workbooks expose every visible tab and its gid in
// /pubhtml. Looking up the gid is more reliable than querying by tab name,
// especially for tabs added after the original workbook was published.
const discoverPublishedSheetGids = cache(async () => {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/pubhtml`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return new Map();

  const html = await response.text();
  const map = new Map();

  const add = (name, gid) => {
    const normalized = normalizeSheetName(decodeHtml(name));
    const cleanGid = clean(gid);
    if (normalized && /^\d+$/.test(cleanGid) && !map.has(normalized)) {
      map.set(normalized, cleanGid);
    }
  };

  // Common pubhtml markup: an anchor contains gid= and the visible tab name.
  for (const match of html.matchAll(
    /<a\b[^>]*href=["'][^"']*[?&#]gid=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    add(match[2], match[1]);
  }

  // Some Google variants put the title in an aria-label/title attribute.
  for (const match of html.matchAll(
    /<(?:a|li|div)\b[^>]*(?:aria-label|title)=["']([^"']+)["'][^>]*[?&#]gid=(\d+)[^>]*>/gi
  )) {
    add(match[1], match[2]);
  }

  // Last-resort parser for serialized tab metadata in the published page.
  for (const match of html.matchAll(
    /["'](?:name|title)["']\s*:\s*["']([^"']+)["'][\s\S]{0,250}?["'](?:gid|sheetId)["']\s*:\s*["']?(\d+)/gi
  )) {
    add(match[1], match[2]);
  }

  return map;
});

async function fetchSheetAliases(sheetNames, optional = false) {
  const names = Array.isArray(sheetNames) ? sheetNames : [sheetNames];
  let lastError;

  // First try the normal Google Visualization query by sheet name.
  // Do not accept an empty result yet: a newly added published tab can
  // occasionally resolve by name but return no rows.
  for (const name of names) {
    try {
      const rows = await fetchCsv(csvUrlByName(name), name);
      if (rows.length) return rows;
    } catch (error) {
      lastError = error;
    }
  }

  // Then discover the tab gid from the published workbook and fetch by gid.
  try {
    const gidMap = await discoverPublishedSheetGids();
    for (const name of names) {
      const gid = gidMap.get(normalizeSheetName(name));
      if (!gid) continue;
      const rows = await fetchCsv(csvUrlByGid(gid), `${name} (gid ${gid})`);
      if (rows.length) return rows;
    }
  } catch (error) {
    lastError = error;
  }

  if (optional) return [];
  throw lastError || new Error(`Unable to load ${names.join(" or ")}`);
}

export const loadPredictionSheets = cache(async () => {
  const entries = await Promise.all(
    Object.entries(SHEETS).map(async ([key, names]) => [
      key,
      await fetchSheetAliases(
        names,
        ["scorecards", "holes", "settings"].includes(key)
      ),
    ])
  );
  return Object.fromEntries(entries);
});
