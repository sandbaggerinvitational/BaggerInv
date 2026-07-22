import { cache } from "react";
import { SPREADSHEET_ID } from "./google-sheets-data";

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
  settings: { label: "Prediction Settings", aliases: ["Prediction Settings", "Prediction Setting"], required: true },
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
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheetName)}`;
}

function csvUrlByGid(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&headers=1&gid=${encodeURIComponent(gid)}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
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

function parsedCsv(text) {
  const rows = parseCsv(text);
  const headers = (rows[0] || []).map(clean).filter(Boolean);
  const data = rows
    .slice(1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])] )));
  return { headers, rows: data };
}

// Google Visualization occasionally guesses that the first data row is a second
// header row. When that happens, "Setting / Value" is returned as headers such
// as "Setting Prediction Model" and "Value SBI v1.0". Explicit headers=1 in
// the request prevents it, while this repair keeps the settings loader resilient.
function repairPredictionSettings(result) {
  if (result.headers.includes("Setting") && result.headers.includes("Value")) return result;
  if (result.headers.length !== 2) return result;

  const [settingHeader, valueHeader] = result.headers;
  const settingPrefix = "Setting ";
  const valuePrefix = "Value ";
  if (!settingHeader.startsWith(settingPrefix) || !valueHeader.startsWith(valuePrefix)) return result;

  const firstSetting = clean(settingHeader.slice(settingPrefix.length));
  const firstValue = clean(valueHeader.slice(valuePrefix.length));
  const repairedRows = result.rows.map((row) => ({
    Setting: clean(row[settingHeader]),
    Value: clean(row[valueHeader]),
  }));

  if (firstSetting || firstValue) repairedRows.unshift({ Setting: firstSetting, Value: firstValue });
  return { headers: ["Setting", "Value"], rows: repairedRows };
}

async function fetchCsv(url, label) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) throw new Error(`${label} did not return public CSV data`);
  return parsedCsv(text);
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

const discoverPublishedSheetGids = cache(async () => {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/pubhtml`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return new Map();
  const html = await response.text();
  const map = new Map();
  const add = (name, gid) => {
    const normalized = normalizeSheetName(decodeHtml(name));
    const cleanGid = clean(gid);
    if (normalized && /^\d+$/.test(cleanGid) && !map.has(normalized)) map.set(normalized, cleanGid);
  };
  for (const match of html.matchAll(/<a\b[^>]*href=["'][^"']*[?&#]gid=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) add(match[2], match[1]);
  for (const match of html.matchAll(/<(?:a|li|div)\b[^>]*(?:aria-label|title)=["']([^"']+)["'][^>]*[?&#]gid=(\d+)[^>]*>/gi)) add(match[1], match[2]);
  for (const match of html.matchAll(/["'](?:name|title)["']\s*:\s*["']([^"']+)["'][\s\S]{0,250}?["'](?:gid|sheetId)["']\s*:\s*["']?(\d+)/gi)) add(match[1], match[2]);
  return map;
});

async function fetchSheetDetailed(config) {
  const attempts = [];
  for (const name of config.aliases) {
    try {
      const fetched = await fetchCsv(csvUrlByName(name), name);
      const result = config.label === "Prediction Settings" ? repairPredictionSettings(fetched) : fetched;
      attempts.push({ source: "name", value: name, ok: true, rows: result.rows.length });
      if (result.headers.length) return { ...result, matchedName: name, source: "name", attempts };
    } catch (error) {
      attempts.push({ source: "name", value: name, ok: false, error: error.message });
    }
  }

  try {
    const gidMap = await discoverPublishedSheetGids();
    for (const name of config.aliases) {
      const gid = gidMap.get(normalizeSheetName(name));
      if (!gid) { attempts.push({ source: "gid", value: name, ok: false, error: "Tab gid not discovered" }); continue; }
      try {
        const fetched = await fetchCsv(csvUrlByGid(gid), `${name} (gid ${gid})`);
        const result = config.label === "Prediction Settings" ? repairPredictionSettings(fetched) : fetched;
        attempts.push({ source: "gid", value: gid, ok: true, rows: result.rows.length });
        if (result.headers.length) return { ...result, matchedName: name, gid, source: "gid", attempts };
      } catch (error) {
        attempts.push({ source: "gid", value: gid, ok: false, error: error.message });
      }
    }
  } catch (error) {
    attempts.push({ source: "gid-discovery", value: "pubhtml", ok: false, error: error.message });
  }

  return { headers: [], rows: [], matchedName: null, source: null, attempts };
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
        gid: result.gid || null,
        attempts: result.attempts,
        rows: result.rows,
      }];
    })
  );
  return { checkedAt, spreadsheetId: SPREADSHEET_ID, sheets: Object.fromEntries(entries) };
});
