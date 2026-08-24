import { cache } from "react";
import fallbackHistoricalData from "./historical-data.json" with { type: "json" };
import { parseNumericValue } from "./formatters.js";
import { isBooleanSheetField } from "./google-sheet-field-types.js";
import {
  PRODUCTION_SPREADSHEET_ID,
  resolveSpreadsheetId,
} from "./spreadsheet-environment.js";
import { mergeCanonicalCareerHistoricalData } from "./career-history-authority.js";
import { markDataAuthorityFallback, recordDataAuthorityTransport } from "./data-authority-request.js";

export const SPREADSHEET_ID = resolveSpreadsheetId();

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
  ghostMatches: "Ghost Match",
};

export const GUIDE_SHEETS = {
  sections: "Guide Sections",
  rules: "Rule Book",
  itinerary: "Tournament Itinerary",
  dining: "Dining",
  localGuide: "Local Guide",
  importantContacts: "Important Contacts",
  information: "Guide Information",
};

export const DRAFT_SHEETS = {
  settings: "Draft Settings",
  picks: "Draft Picks",
};

export const SCORECARD_SHEETS = {
  roundScorecards: "Round Scorecards",
  courseHoles: "Course Holes",
};

export const PRODUCTION_CURRENT_SHADOW_SHEETS = Object.freeze([
  "Tournaments",
  "Live Tournaments",
  "Players",
  "Handicaps",
  "Team Names",
  "Rounds",
  "Tournament Rules",
  "Courses",
  "Course Holes",
  "Live Matches",
  "Matches",
  "Live Hole Scores",
  "Match Update Log",
  "Admin Audit Log",
]);

// Exact read-only workbook surface used to prepare dormant Step 10A
// Production projection envelopes. This intentionally excludes every Preview
// fixture/rehearsal source and never accepts a caller-supplied workbook ID.
export const PRODUCTION_PROJECTION_SHADOW_SHEETS = Object.freeze([
  "Tournaments",
  "Guide Sections",
  "Tournament Itinerary",
  "Tournament Timeline",
  "Rule Book",
  "Tournament Rules",
  "Rounds",
  "Dining",
  "Local Guide",
  "Important Contacts",
  "Courses",
  "Players",
  "Prediction Settings",
  "Draft Settings",
  "Draft Picks",
  "Net Skins",
  "Live Matches",
  "Calcutta Purchases",
  "Calcutta Ownership",
  "Calcutta Point Structure",
  "Calcutta Payout",
  "Odds Control",
  "Odds Snapshots",
  "Odds Team Results",
  "Odds Player Results",
]);

// Historical and recorded-score data changes infrequently compared with live
// scoring. Reuse Google's CSV responses across requests so every history page
// does not wait on the same sheets again.
export const HISTORICAL_CACHE_SECONDS = 300;
export const SCORECARD_CACHE_SECONDS = 300;
export const GOOGLE_SHEETS_CACHE_TAG = "sbi-google-sheets";

const SCORECARD_REQUIRED_FIELDS = Object.freeze({
  roundScorecards: ["Match ID", "Year", "Course ID", "Score Type"],
  courseHoles: ["Course ID", "Tee", "Hole Number", "Par", "Stroke Index"],
});

function scorecardSheetIsStructurallyComplete(key, rows) {
  const required = SCORECARD_REQUIRED_FIELDS[key] || [];
  return Array.isArray(rows)
    && rows.length > 0
    && rows.every((row) => required.every((field) => String(row?.[field] ?? "").trim() !== ""));
}

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
  "Total Picks",
  "Total Draft Picks",
  "Pick Number",
  "Hole Number",
  "Stroke Index",
  ...Array.from({ length: 18 }, (_, index) => `Hole ${index + 1}`),
]);

function csvUrl(sheetName, spreadsheetId = SPREADSHEET_ID) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
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

function convertValue(sheetName, header, value) {
  const normalized = clean(value);
  if (!normalized) return null;

  if (isBooleanSheetField(sheetName, header)) {
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
          convertValue(sheetName, header, row[index]),
        ])
      );
      Object.defineProperties(record, {
        __sheetName: { value: sheetName, enumerable: false },
        __sheetRow: { value: rowIndex + 2, enumerable: false },
      });
      return record;
    });
}

async function fetchSheet(sheetName, {
  cache = "no-store",
  revalidate,
  spreadsheetId,
  timeoutMs,
} = {}) {
  recordDataAuthorityTransport("google", { adapter: "google-sheets-data", transport: "gviz" });
  const response = await fetch(csvUrl(sheetName, spreadsheetId), {
    cache,
    ...(revalidate ? { next: { revalidate, tags: [GOOGLE_SHEETS_CACHE_TAG] } } : {}),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
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

async function fetchStructuredSheet(sheetName, {
  spreadsheetId,
  timeoutMs,
} = {}) {
  recordDataAuthorityTransport("google", { adapter: "google-sheets-data", transport: "gviz" });
  const response = await fetch(csvUrl(sheetName, spreadsheetId), {
    cache: "no-store",
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!response.ok) throw new Error(`${sheetName} returned HTTP ${response.status}.`);
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    throw new Error(`${sheetName} did not return public CSV data.`);
  }
  const rows = parseCsv(text);
  const headers = (rows[0] || []).map(clean);
  if (!headers.length || !headers.some(Boolean)) {
    throw new Error(`${sheetName} has no readable header row.`);
  }
  const records = rowsToObjects(rows, sheetName).map((record, index) => ({
    record,
    rowNumber: Number(record.__sheetRow || index + 2),
  }));
  return { headers, records };
}

async function loadHistoricalDataFromSpreadsheet(spreadsheetIdForSheet, {
  preserveCanonicalMatchesOnFallback = false,
} = {}) {
  const sheetEntries = Object.entries(HISTORICAL_SHEETS);
  const settled = await Promise.allSettled(
    sheetEntries.map(async ([key, sheetName]) => {
      try {
        return [key, await fetchSheet(sheetName, {
          cache: "force-cache",
          revalidate: HISTORICAL_CACHE_SECONDS,
          spreadsheetId: typeof spreadsheetIdForSheet === "function"
            ? spreadsheetIdForSheet(sheetName)
            : spreadsheetIdForSheet,
          timeoutMs: 10_000,
        })];
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

  const firstFailure = settled.find((entry) => entry.status === "rejected");
  if (firstFailure) {
    if (!preserveCanonicalMatchesOnFallback) throw firstFailure.reason;
    const matchesIndex = sheetEntries.findIndex(([key]) => key === "matches");
    const canonicalMatches = settled[matchesIndex];
    if (canonicalMatches?.status !== "fulfilled") throw canonicalMatches?.reason || firstFailure.reason;
    return {
      ...fallbackHistoricalData,
      matches: canonicalMatches.value[1],
    };
  }

  return Object.fromEntries(settled.map((entry) => entry.value));
}

export const loadHistoricalData = cache(async () =>
  loadHistoricalDataFromSpreadsheet(SPREADSHEET_ID)
);

// The 2017–2022 completed-year migration is sourced from the established
// production historical workbook. The Preview workbook intentionally does not
// duplicate these archive tabs, and falling back after one missing Preview tab
// would revive stale 2019/2020 point totals from the bundled snapshot.
export const loadCanonical2017To2022HistoricalData = cache(async () =>
  loadHistoricalDataFromSpreadsheet(PRODUCTION_SPREADSHEET_ID)
);

export const loadCanonicalCareerHistoricalData = cache(async () =>
  mergeCanonicalCareerHistoricalData({
    canonical: await loadCanonical2017To2022HistoricalData(),
    current: fallbackHistoricalData,
  })
);

/**
 * Step 6A completed-history imports use one fail-closed source boundary for
 * every 2017-2025 fact. Unlike the participant-facing legacy loaders, this
 * function never mixes the Preview workbook or bundled JSON into a partially
 * successful read. The returned rows are still source facts; canonical
 * corrections and evidence classification happen in the shared importer.
 */
export const loadCanonicalCompletedHistoryFoundationData = cache(async () => {
  const [historical, roundScorecards, courseHoles] = await Promise.all([
    loadHistoricalDataFromSpreadsheet(PRODUCTION_SPREADSHEET_ID),
    fetchSheet(SCORECARD_SHEETS.roundScorecards, {
      cache: "no-store",
      spreadsheetId: PRODUCTION_SPREADSHEET_ID,
      timeoutMs: 15_000,
    }),
    fetchSheet(SCORECARD_SHEETS.courseHoles, {
      cache: "no-store",
      spreadsheetId: PRODUCTION_SPREADSHEET_ID,
      timeoutMs: 15_000,
    }),
  ]);
  if (
    !scorecardSheetIsStructurallyComplete("roundScorecards", roundScorecards) ||
    !scorecardSheetIsStructurallyComplete("courseHoles", courseHoles)
  ) {
    throw new Error("The completed-history scorecard source is structurally incomplete.");
  }
  return { ...historical, roundScorecards, courseHoles };
});

/**
 * Targeted, read-only source for the dormant Production current-tournament
 * shadow importer. The workbook identity is intentionally not configurable:
 * Preview and caller-supplied workbook IDs can never enter this path.
 */
export const loadCanonicalProductionCurrentShadowSource = cache(async () => {
  const entries = await Promise.all(PRODUCTION_CURRENT_SHADOW_SHEETS.map(async (sheetName) => [
    sheetName,
    await fetchStructuredSheet(sheetName, {
      spreadsheetId: PRODUCTION_SPREADSHEET_ID,
      timeoutMs: 15_000,
    }),
  ]));
  return Object.fromEntries(entries);
});

/**
 * Targeted GViz reader for local/server-side Step 10A payload preparation.
 * The Production workbook identity is a compile-time constant, so neither a
 * Preview runtime nor a caller can redirect this reader to another workbook.
 */
export async function loadCanonicalProductionProjectionShadowSource() {
  const entries = await Promise.all(PRODUCTION_PROJECTION_SHADOW_SHEETS.map(async (sheetName) => [
    sheetName,
    await fetchStructuredSheet(sheetName, {
      spreadsheetId: PRODUCTION_SPREADSHEET_ID,
      timeoutMs: 15_000,
    }),
  ]));
  return Object.fromEntries(entries);
}

// Completed legacy History is a read-only archive. The 2024 migration uses
// the same production Matches context as its production Round Scorecards and
// Course Holes, even when the live Preview workbook is isolated for scoring.
export const loadCanonical2024HistoricalData = cache(async () =>
  loadHistoricalDataFromSpreadsheet(
    (sheetName) => sheetName === HISTORICAL_SHEETS.matches
      ? PRODUCTION_SPREADSHEET_ID
      : SPREADSHEET_ID,
    { preserveCanonicalMatchesOnFallback: true }
  )
);

// The 2023 completed-year migration uses the same production Matches
// authority as its production scorecards. This preserves the established
// archive fallback for every other historical collection.
export const loadCanonical2023HistoricalData = cache(async () =>
  loadHistoricalDataFromSpreadsheet(
    (sheetName) => sheetName === HISTORICAL_SHEETS.matches
      ? PRODUCTION_SPREADSHEET_ID
      : SPREADSHEET_ID,
    { preserveCanonicalMatchesOnFallback: true }
  )
);

/**
 * Archived Course Profile needs only its canonical course row and historical
 * tee holes. Avoid loading the live Guide workbook or unrelated archive tabs.
 */
export const loadArchivedCourseSheets = cache(async () => {
  const [courseArchive, courseHoles] = await Promise.all([
    fetchSheet(HISTORICAL_SHEETS.courses, {
      cache: "force-cache",
      revalidate: HISTORICAL_CACHE_SECONDS,
      // Archived Course Profile is part of the same established read-only
      // history source as archived scorecards. Preview workbooks are not
      // required to duplicate these completed-year course rows.
      spreadsheetId: PRODUCTION_SPREADSHEET_ID,
      timeoutMs: 10_000,
    }),
    fetchSheet(SCORECARD_SHEETS.courseHoles, {
      cache: "force-cache",
      revalidate: SCORECARD_CACHE_SECONDS,
      spreadsheetId: PRODUCTION_SPREADSHEET_ID,
      timeoutMs: 10_000,
    }),
  ]);
  return { courseArchive, courseHoles };
});

/** @deprecated Runtime Guide reads use the targeted Guide adapter/sync path. */
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

export const loadDraftSheets = cache(async () => {
  const entries = await Promise.all(
    Object.entries(DRAFT_SHEETS).map(async ([key, sheetName]) => {
      try {
        return [key, await fetchSheet(sheetName)];
      } catch (error) {
        console.warn("Draft sheet unavailable", {
          sheet: sheetName,
          reason: error?.message || String(error),
        });
        return [key, []];
      }
    })
  );

  return Object.fromEntries(entries);
});

async function loadScorecardSheetsWithHistoricalContext(loadHistoricalContext) {
  let historicalMode = "canonical";
  const [historical, scorecardResults] = await Promise.all([
    loadHistoricalContext().catch((error) => {
      console.warn("Legacy scorecard context sheets unavailable; using the established bundled archive context.", {
        reason: error?.message || String(error),
      });
      historicalMode = "bundled-fallback";
      markDataAuthorityFallback("historical-data.json:scorecard-context");
      return fallbackHistoricalData;
    }),
    Promise.all(
      Object.entries(SCORECARD_SHEETS).map(async ([key, sheetName]) => {
        try {
          return {
            key,
            sheetName,
            rows: await fetchSheet(sheetName, {
              cache: "force-cache",
              revalidate: SCORECARD_CACHE_SECONDS,
              // Older scorecards are an established read-only archive. Keep
              // them isolated from the mutable Preview scoring workbook; 2026
              // History never enters this legacy loader.
              spreadsheetId: PRODUCTION_SPREADSHEET_ID,
              timeoutMs: 10_000,
            }),
            failed: false,
          };
        } catch (error) {
          console.warn("Scorecard analytics sheet unavailable", {
            sheet: sheetName,
            reason: error?.message || String(error),
          });
          return { key, sheetName, rows: [], failed: true };
        }
      })
    ),
  ]);

  for (const result of scorecardResults) {
    if (!result.failed && !scorecardSheetIsStructurallyComplete(result.key, result.rows)) {
      result.failed = true;
      console.warn("Scorecard analytics sheet failed structural validation", {
        sheet: result.sheetName,
      });
    }
  }

  const result = {
    ...historical,
    ...Object.fromEntries(scorecardResults.map(({ key, rows }) => [key, rows])),
  };
  Object.defineProperty(result, "__scorecardSourceHealth", {
    enumerable: false,
    value: Object.freeze({
      complete: scorecardResults.every(({ failed }) => !failed),
      failedSheets: Object.freeze(scorecardResults.filter(({ failed }) => failed).map(({ sheetName }) => sheetName)),
      historicalMode,
    }),
  });
  return result;
}

export const loadScorecardSheets = cache(async () =>
  loadScorecardSheetsWithHistoricalContext(loadHistoricalData)
);

export const loadCanonical2024ScorecardSheets = cache(async () =>
  loadScorecardSheetsWithHistoricalContext(loadCanonical2024HistoricalData)
);

export const loadCanonical2023ScorecardSheets = cache(async () =>
  loadScorecardSheetsWithHistoricalContext(loadCanonical2023HistoricalData)
);

export const loadCanonical2017To2022ScorecardSheets = cache(async () =>
  loadScorecardSheetsWithHistoricalContext(loadCanonical2017To2022HistoricalData)
);

export const loadCanonicalCareerScorecardSheets = cache(async () =>
  loadScorecardSheetsWithHistoricalContext(loadCanonicalCareerHistoricalData)
);
