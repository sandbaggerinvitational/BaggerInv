import { createSign, randomBytes, randomInt, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { TOURNAMENT_CMS_FIELDS, cmsResource } from "./admin-cms-config.js";
import {
  getEffectiveTournamentState,
  getTournamentState,
  isFinalizedMatch,
  isOfficialMatchResult,
} from "./live-tournament.js";
import {
  assertValidTournamentId,
  isValidTournamentYear,
  recordBelongsToTournament,
  tournamentId,
  tournamentYear,
} from "./tournament-identifiers.js";
import {
  LIVE_PAIRING_FIELDS,
  validateLiveMatchPairing,
} from "./live-match-pairing.js";
import { accessCodeMatches, accessTokenMatches, calculateLiveHole, calculateLiveMatchStatus, calculateMatchPoints, hashAccessCode, hashAccessToken } from "./live-hole-scoring.js";
import { grossScoresForWorkbook, grossScoresFromCell } from "./live-score-values.js";
import {
  buildGhostMatchExclusionSet,
  isPlayerExcludedFromMatchRecord,
} from "./ghost-match.js";
import {
  assertLiveScoringWriteEnvironment,
  resolveSpreadsheetId,
} from "./spreadsheet-environment.js";
import { participantSessionMatchesAccess } from "./scoring-access.js";
import { isPreviewImpersonationSession, playerAppearsInMatch, playerMatchSides, previewPlayerFromRecords } from "./player-passport.js";
import { finalizedMatchResult } from "./game-center.js";
import { normalizePlayerRole } from "./player-role.js";
import {
  buildFinalizedMatchArchiveSnapshot,
  FINALIZED_MATCH_ARCHIVE_HEADERS,
} from "./finalized-match-archive.js";
import { googleResponseError, isTransientGoogleError, withTransientGoogleRetry } from "./google-api-reliability.js";
import { invalidateNormalizedSheetCache } from "./google-sheets-server-read.js";
import { NET_SKINS_RESULT_HEADERS, netSkinsResultRecords } from "./net-skins.js";
import { tournamentReadiness } from "./tournament-readiness.js";
import { notificationReady, parsePushSubscription } from "./web-push-notifications.js";
import {
  PREVIEW_RESET_DERIVED,
  PREVIEW_RESET_PRESERVES,
  recordInPreviewTournament,
  resetPreviewMatchRecord,
} from "./preview-tournament-reset.js";
import {
  protectedFields,
  normalizeWorkbookWriteValue,
  validateFieldWrite,
  validateSheetSchema,
  writableFields,
} from "./workbook-protection.js";
import {
  LIVE_MATCH_CORE_SCORE_HEADERS,
  existingLiveMatchProgressUpdates,
} from "./live-match-schema.js";
import { calcuttaPublicationReadiness, calcuttaPublicationRecords, calcuttaRoundResultsFromTournamentModel } from "./calcutta.js";

const SHEET_ID = resolveSpreadsheetId();
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
let cachedGoogleToken = "";
let cachedGoogleTokenExpiresAt = 0;
let pendingGoogleToken;
let googleMutationQueue = Promise.resolve();
const writeDiagnostics = new AsyncLocalStorage();

function metric(name, amount = 1) {
  const diagnostics = writeDiagnostics.getStore();
  if (diagnostics) diagnostics[name] = Number(diagnostics[name] || 0) + amount;
}

export async function withWorkbookWriteDiagnostics(label, operation) {
  const parent = writeDiagnostics.getStore();
  const metricKeys = ["httpRequests", "sheetsApiCalls", "workbookWrites", "retryLoops", "batchRequests", "individualWorksheetRequests", "duplicateWorksheetReads", "cacheHits", "cacheMisses", "rangesRequested"];
  if (parent) {
    const before = Object.fromEntries(metricKeys.map((key) => [key, Number(parent[key] || 0)]));
    const report = () => ({ label, ...Object.fromEntries(metricKeys.map((key) => [key, Number(parent[key] || 0) - before[key]])) });
    try {
      return { result: await operation(), diagnostics: report() };
    } catch (error) {
      error.workbookDiagnostics = report();
      throw error;
    }
  }
  const diagnostics = {
    label, httpRequests: 0, sheetsApiCalls: 0, workbookWrites: 0, retryLoops: 0,
    batchRequests: 0, individualWorksheetRequests: 0, duplicateWorksheetReads: 0,
    cacheHits: 0, cacheMisses: 0, rangesRequested: 0, _sheetSnapshots: new Map(), _workbookMetadata: undefined,
  };
  const report = () => Object.fromEntries(Object.entries(diagnostics).filter(([key]) => !key.startsWith("_")));
  try {
    const result = await writeDiagnostics.run(diagnostics, operation);
    return { result, diagnostics: report() };
  } catch (error) {
    error.workbookDiagnostics = report();
    throw error;
  }
}

function rangeSheetName(range) {
  return String(range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'").trim();
}

function mutationSheetNames(path, options) {
  try {
    const body = JSON.parse(options?.body || "{}");
    const ranges = [
      ...(body.data || []).map((item) => item.range),
      ...(body.ranges || []),
    ];
    if (!ranges.length && path.startsWith("/values/")) ranges.push(decodeURIComponent(path.slice("/values/".length)));
    return [...new Set(ranges.map(rangeSheetName).filter(Boolean))];
  } catch {
    return [];
  }
}

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Google Sheets write credentials are not configured.");
  return { email, privateKey };
}

function base64url(value) { return Buffer.from(value).toString("base64url"); }

async function accessToken() {
  if (cachedGoogleToken && cachedGoogleTokenExpiresAt > Date.now() + 60_000) return cachedGoogleToken;
  if (pendingGoogleToken) return pendingGoogleToken;
  pendingGoogleToken = (async () => {
  const { email, privateKey } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, jti: randomUUID() }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
  metric("httpRequests");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const oauthError = String(payload.error || "unknown").replace(/[^a-z0-9_-]/gi, "");
    const description = String(payload.error_description || "").slice(0, 160);
    throw new Error(`Google authentication failed (${response.status}: ${oauthError}${description ? ` — ${description}` : ""}).`);
  }
  cachedGoogleToken = payload.access_token;
  cachedGoogleTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return cachedGoogleToken;
  })().finally(() => { pendingGoogleToken = undefined; });
  return pendingGoogleToken;
}

async function google(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const diagnostics = writeDiagnostics.getStore();
  const perform = async () => {
    const token = await accessToken();
    metric("httpRequests");
    metric("sheetsApiCalls");
    if (method === "GET" && path.includes("batchGet")) metric("batchRequests");
    else if (method === "GET" && path.startsWith("/values/")) metric("individualWorksheetRequests");
    if (method === "GET") {
      const query = path.split("?")[1] || "";
      const rangeCount = path.includes("batchGet") ? new URLSearchParams(query).getAll("ranges").length : 1;
      metric("rangesRequested", rangeCount);
    }
    const response = await fetch(`${API}${path}`, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) }, cache: "no-store", signal: options.signal || AbortSignal.timeout(10_000) });
    if (!response.ok) {
      if (method === "GET") throw googleResponseError("Google Sheets request", response.status);
      throw new Error(`Google Sheets request failed (${response.status}): ${await response.text()}`);
    }
    const payload = response.status === 204 ? null : await response.json();
    if (method !== "GET") {
      const affectedSheets = mutationSheetNames(path, options);
      invalidateNormalizedSheetCache(affectedSheets.length ? affectedSheets : undefined);
      for (const sheetName of affectedSheets) diagnostics?._sheetSnapshots?.delete(sheetName);
      invalidateOddsSnapshotCache();
    }
    return payload;
  };
  if (method === "GET") return withTransientGoogleRetry(perform, { onRetry: () => metric("retryLoops") });
  const safeMutation = /\/values:batch(?:Update|Clear)$/.test(path);
  if (!safeMutation) return perform();
  const execute = () => withTransientGoogleRetry(perform, {
    maxRetries: 4,
    delays: [250, 500, 1000, 2000],
    onRetry: () => metric("retryLoops"),
  });
  const queued = googleMutationQueue.then(execute, execute);
  googleMutationQueue = queued.catch(() => undefined);
  return queued;
}

const TABS = ["Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results"];

async function readWorkbookMetadata() {
  const diagnostics = writeDiagnostics.getStore();
  if (diagnostics?._workbookMetadata) {
    metric("cacheHits");
    return diagnostics._workbookMetadata;
  }
  metric("cacheMisses");
  const book = await google("");
  if (diagnostics) diagnostics._workbookMetadata = book;
  return book;
}

export const GUIDE_TAB_SCHEMAS = {
  sections: {
    tab: "Guide Sections",
    id: "Section ID",
    headers: ["Section ID", "Tournament ID", "Section Name", "Section Slug", "Description", "Display Order", "Status", "Updated At"],
  },
  rules: {
    tab: "Rule Book",
    id: "Rule ID",
    headers: ["Rule ID", "Tournament ID", "Category", "Subcategory", "Title", "Body", "Display Order", "Status", "Effective Year", "Updated At", "Important"],
  },
  itinerary: {
    tab: "Tournament Itinerary",
    id: "Event ID",
    headers: ["Event ID", "Tournament ID", "Event Date", "Day Label", "Start Time", "End Time", "Event Type", "Title", "Subtitle", "Location", "Details", "Round ID", "Course ID", "Display Order", "Status", "Featured", "Updated At"],
  },
  information: {
    tab: "Guide Information",
    id: "Item ID",
    headers: ["Item ID", "Tournament ID", "Section", "Title", "Body", "Label", "Link Text", "Link URL", "Display Order", "Status", "Sensitive", "Updated At"],
  },
};

export async function ensureOddsTabs() {
  const book = await readWorkbookMetadata();
  const existing = new Set((book.sheets || []).map((sheet) => sheet.properties.title));
  const missing = TABS.filter((title) => !existing.has(title));
  if (missing.length) throw new Error(`Workbook schema is missing required sheets: ${missing.join(", ")}. Workbook structure was not modified.`);
}

let oddsSnapshotCache;
let oddsSnapshotCachedAt = 0;
let pendingOddsSnapshotRead;
const ODDS_SNAPSHOT_CACHE_TTL_MS = 60_000;

export async function readOddsSnapshots() {
  if (oddsSnapshotCache && Date.now() - oddsSnapshotCachedAt < ODDS_SNAPSHOT_CACHE_TTL_MS) return oddsSnapshotCache;
  if (pendingOddsSnapshotRead) return pendingOddsSnapshotRead;
  try {
    pendingOddsSnapshotRead = google(`/values/${encodeURIComponent("Odds Snapshots!A2:D")}`).then((data) => {
      const snapshots = (data.values || []).map(([year, phase, publishedAt, payload]) => ({ year: Number(year), phase, publishedAt, ...JSON.parse(payload) }));
      oddsSnapshotCache = snapshots;
      oddsSnapshotCachedAt = Date.now();
      return snapshots;
    });
    return await pendingOddsSnapshotRead;
  } catch { return []; }
  finally { pendingOddsSnapshotRead = undefined; }
}

export function invalidateOddsSnapshotCache() {
  oddsSnapshotCache = undefined;
  oddsSnapshotCachedAt = 0;
  pendingOddsSnapshotRead = undefined;
}

const PREVIEW_RESET_ROW_TABS = [
  "Live Hole Scores", "Net Skins Result", "Odds Control", "Odds Snapshots",
  "Odds Team Results", "Odds Player Results", "Notification Log",
  "Closest to Pin", "Closest to Pin Results", "Closest To Pin", "Closest To Pin Results",
];

function resetRowBelongsToTournament(tab, record, scope, matchIds) {
  if (["Live Hole Scores"].includes(tab)) return matchIds.has(String(record["Match ID"] || "").trim());
  if (tab === "Notification Log") return String(record["Tournament ID"] || "").trim() === String(scope.tournamentId || "").trim();
  return recordInPreviewTournament(record, scope);
}

function fieldScopedChanges(tab, headers, before, after) {
  return Object.fromEntries(writableFields(tab)
    .filter((field) => headers.includes(field) && Object.hasOwn(after, field) && String(after[field] ?? "") !== String(before[field] ?? ""))
    .map((field) => [field, after[field] ?? ""]));
}

export async function resetPreviewTournament(reference, updatedByValue) {
  if (process.env.VERCEL_ENV !== "preview") throw new Error("Preview tournament reset is not available in this environment.");
  requireIsolatedScoringSheet();
  const updatedBy = editorName(updatedByValue);
  const [tournaments, liveMatches] = await Promise.all([readSheet("Tournaments"), readSheet("Live Matches")]);
  requireHeaders(tournaments, "Tournaments", ["Year"]);
  requireHeaders(liveMatches, "Live Matches", ["Match ID", "Match Status"]);
  const tournament = tournamentRecord(tournaments, reference);
  const scope = { tournamentId: tournamentId(tournament.record), year: tournamentYear(tournament.record) };
  const scopedLiveMatches = liveMatches.records.filter(({ record }) => recordInPreviewTournament(record, scope));
  const matchIds = new Set(scopedLiveMatches.map(({ record }) => String(record["Match ID"] || "").trim()).filter(Boolean));
  const now = new Date().toISOString();

  await writeSheetFields("Tournaments", tournaments.headers, tournament.rowNumber, {
    "Status Mode": "Automatic", "Tournament Status": "Upcoming", "Current Round": "1",
    "Winning Team": "", "Runner-Up Team": "", "Final Score": "",
    "Updated At": now, "Updated By": updatedBy,
  });
  for (const row of scopedLiveMatches) {
    const updates = fieldScopedChanges("Live Matches", liveMatches.headers, row.record, resetPreviewMatchRecord(row.record, now));
    if (Object.keys(updates).length) await writeSheetFields("Live Matches", liveMatches.headers, row.rowNumber, updates);
  }

  const book = await readWorkbookMetadata();
  const existingTabs = new Set((book.sheets || []).map((sheet) => sheet.properties.title));
  let finalizedMatches = 0;
  if (existingTabs.has("Matches")) {
    const matches = await readSheet("Matches");
    for (const row of matches.records.filter(({ record }) => recordInPreviewTournament(record, scope))) {
      const updates = fieldScopedChanges("Matches", matches.headers, row.record, resetPreviewMatchRecord(row.record, now));
      if (Object.keys(updates).length) await writeSheetFields("Matches", matches.headers, row.rowNumber, updates);
      finalizedMatches += 1;
    }
  }

  const cleared = {};
  for (const tab of PREVIEW_RESET_ROW_TABS.filter((name) => existingTabs.has(name))) {
    const sheet = await readSheet(tab);
    validateSheetSchema(tab, sheet.headers);
    const selected = sheet.records.filter(({ record }) => resetRowBelongsToTournament(tab, record, scope, matchIds));
    cleared[tab] = selected.length;
    for (const row of selected) await clearSheetFields(tab, sheet.headers, row.rowNumber, writableFields(tab));
  }

  if (existingTabs.has("Match Update Log")) {
    const log = await readSheet("Match Update Log");
    const selected = log.records.filter(({ record }) => matchIds.has(String(record["Match ID"] || "").trim()));
    cleared["Match Update Log"] = selected.length;
    for (const row of selected) await clearSheetFields("Match Update Log", log.headers, row.rowNumber, writableFields("Match Update Log"));
  }

  await appendAdminAudit({
    resource: "preview-reset", recordId: scope.tournamentId || String(scope.year), action: "Reset",
    previous: { liveMatches: scopedLiveMatches.length, finalizedMatches, cleared },
    next: { status: "Upcoming", currentRound: 1 }, updatedBy, summary: "Preview tournament reset",
  });
  return {
    tournamentId: scope.tournamentId, year: scope.year, liveMatches: scopedLiveMatches.length,
    finalizedMatches, cleared, derived: PREVIEW_RESET_DERIVED, preserved: PREVIEW_RESET_PRESERVES,
  };
}

export async function synchronizeNetSkinsResults(yearValue, roundValue, options = {}) {
  requireIsolatedScoringSheet();
  const year = Number(yearValue);
  const round = Number(roundValue);
  if (!year || !round) return { synchronized: false, reason: "invalid-scope" };
  const data = options.tournamentModel || await (async () => {
    const { getTournamentData } = await import("../app/live/sheetData.js");
    return getTournamentData();
  })();
  const calculated = data.netSkins?.rounds?.find((item) => Number(item.round) === round);
  const sheet = await requireTabHeaders("Net Skins Result", NET_SKINS_RESULT_HEADERS);
  requireHeaders(sheet, "Net Skins Result", NET_SKINS_RESULT_HEADERS);
  const preserved = sheet.records.map(({ record }) => record).filter((record) =>
    Number(record.Year) !== year || Number(record.Round) !== round
  );
  const official = calculated?.finalized
    ? netSkinsResultRecords({ results: calculated.skins })
    : [];
  const records = [...preserved, ...official];
  await replaceRuntimeRecords("Net Skins Result", sheet, records);
  return {
    synchronized: true,
    finalized: Boolean(calculated?.finalized),
    results: official.length,
    year,
    round,
  };
}

async function synchronizeNetSkinsAfterMatch(record, options = {}) {
  try {
    return await synchronizeNetSkinsResults(record.Year, record.Round, options);
  } catch (error) {
    console.error("Net Skins synchronization failed", {
      year: String(record.Year || ""),
      round: String(record.Round || ""),
      reason: error?.message || String(error),
    });
    return { synchronized: false, reason: "sync-failed" };
  }
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function sheetFromValues(values = []) {
  const [headers = []] = values;
  const records = values
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      record: Object.fromEntries(
        headers.flatMap((header, column) => header ? [[header, row[column] ?? ""]] : [])
      ),
    }))
    .filter(({ record }) => Object.values(record).some((value) => String(value ?? "").trim()));
  return { headers, records };
}

async function readSheet(tab) {
  const diagnostics = writeDiagnostics.getStore();
  if (diagnostics?._sheetSnapshots?.has(tab)) {
    metric("cacheHits");
    metric("duplicateWorksheetReads");
    return diagnostics._sheetSnapshots.get(tab);
  }
  metric("cacheMisses");
  const data = await google(`/values/${encodeURIComponent(`${tab}!A:ZZ`)}`);
  const sheet = sheetFromValues(data.values || []);
  diagnostics?._sheetSnapshots?.set(tab, sheet);
  return sheet;
}

async function readSheets(tabs) {
  const diagnostics = writeDiagnostics.getStore();
  const cached = Object.fromEntries(tabs.flatMap((tab) => {
    if (!diagnostics?._sheetSnapshots?.has(tab)) return [];
    metric("cacheHits");
    metric("duplicateWorksheetReads");
    return [[tab, diagnostics._sheetSnapshots.get(tab)]];
  }));
  const missing = tabs.filter((tab) => !Object.hasOwn(cached, tab));
  metric("cacheMisses", missing.length);
  if (!missing.length) return cached;
  const query = new URLSearchParams();
  missing.forEach((tab) => query.append("ranges", `${tab}!A:ZZ`));
  const data = await google(`/values:batchGet?${query.toString()}`);
  const loaded = Object.fromEntries(missing.map((tab, index) => [
    tab,
    sheetFromValues(data.valueRanges?.[index]?.values || []),
  ]));
  for (const [tab, sheet] of Object.entries(loaded)) diagnostics?._sheetSnapshots?.set(tab, sheet);
  return { ...cached, ...loaded };
}

export async function readWorkbookSheetTitles() {
  const book = await readWorkbookMetadata();
  return (book.sheets || []).map((sheet) => String(sheet?.properties?.title || "").trim()).filter(Boolean);
}

export async function readWorkbookSheetsByName(tabs) {
  return readSheets(tabs);
}

async function readProtectedFieldValues(tab, headers, rowNumber) {
  const fields = protectedFields(tab).filter((field) => headers.includes(field));
  if (!fields.length) return {};
  const query = new URLSearchParams({ valueRenderOption: "FORMULA" });
  for (const field of fields) {
    const column = columnName(headers.indexOf(field));
    query.append("ranges", `${tab}!${column}${rowNumber}`);
  }
  const data = await google(`/values:batchGet?${query.toString()}`);
  return Object.fromEntries(fields.map((field, index) => [
    field,
    data.valueRanges?.[index]?.values?.[0]?.[0] ?? "",
  ]));
}

async function writeSheetFields(tab, headers, rowNumber, updates) {
  validateFieldWrite(tab, headers, updates);
  const protectedBefore = await readProtectedFieldValues(tab, headers, rowNumber);
  const data = Object.entries(updates)
    .map(([header, value]) => {
      const column = columnName(headers.indexOf(header));
      return {
        range: `${tab}!${column}${rowNumber}`,
        values: [[normalizeWorkbookWriteValue(tab, header, value)]],
      };
    });
  if (!data.length) return;
  metric("workbookWrites");
  await google("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  const protectedAfter = await readProtectedFieldValues(tab, headers, rowNumber);
  if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
    throw new Error(`${tab} protected-column validation failed after writing row ${rowNumber}.`);
  }
}

async function appendSheetFields(tab, sheet, record) {
  const rowNumber = Math.max(1, ...sheet.records.map((item) => item.rowNumber)) + 1;
  await writeSheetFields(tab, sheet.headers, rowNumber, record);
  return rowNumber;
}

async function clearSheetFields(tab, headers, rowNumber, fields) {
  const updates = Object.fromEntries(fields.map((field) => [field, ""]));
  validateFieldWrite(tab, headers, updates);
  const protectedBefore = await readProtectedFieldValues(tab, headers, rowNumber);
  const ranges = fields.map((field) => {
    const column = columnName(headers.indexOf(field));
    return `${tab}!${column}${rowNumber}`;
  });
  await google("/values:batchClear", {
    method: "POST",
    body: JSON.stringify({ ranges }),
  });
  const protectedAfter = await readProtectedFieldValues(tab, headers, rowNumber);
  if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
    throw new Error(`${tab} protected-column validation failed after clearing row ${rowNumber}.`);
  }
}

async function requireTabHeaders(tab, requiredHeaders) {
  const book = await readWorkbookMetadata();
  const sheets = book.sheets || [];
  const existing = new Set(sheets.map((sheet) => sheet.properties.title));
  if (!existing.has(tab)) {
    throw new Error(`Workbook schema is missing required sheet '${tab}'. Workbook structure was not modified.`);
  }

  const sheet = await readSheet(tab);
  validateSheetSchema(tab, sheet.headers, requiredHeaders);
  return sheet;
}

async function replaceRuntimeRecords(tab, sheet, records, fields = writableFields(tab)) {
  const activeFields = fields.filter((field) => sheet.headers.includes(field));
  validateSheetSchema(tab, sheet.headers, activeFields);
  for (const row of sheet.records) await clearSheetFields(tab, sheet.headers, row.rowNumber, activeFields);
  for (let index = 0; index < records.length; index += 1) {
    const record = Object.fromEntries(activeFields.map((field) => [field, records[index]?.[field] ?? ""]));
    await writeSheetFields(tab, sheet.headers, index + 2, record);
  }
}

async function replaceRuntimeRecordSets(sets) {
  const data = [];
  for (const { tab, sheet, records, fields = writableFields(tab) } of sets) {
    const activeFields = fields.filter((field) => sheet.headers.includes(field));
    validateSheetSchema(tab, sheet.headers, activeFields);
    const rowCount = Math.max(sheet.records.length, records.length);
    for (let index = 0; index < rowCount; index += 1) {
      const updates = Object.fromEntries(activeFields.map((field) => [field, records[index]?.[field] ?? ""]));
      validateFieldWrite(tab, sheet.headers, updates);
      for (const [field, value] of Object.entries(updates)) {
        const column = columnName(sheet.headers.indexOf(field));
        data.push({ range: `${tab}!${column}${index + 2}`, values: [[normalizeWorkbookWriteValue(tab, field, value)]] });
      }
    }
  }
  if (!data.length) return;
  metric("workbookWrites");
  await google("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

async function replaceScopedRuntimeRecordSets(sets) {
  const data = [];
  const counts = {};
  for (const { tab, sheet, records, belongsToScope, fields: requestedFields = writableFields(tab) } of sets) {
    const fields = requestedFields.filter((field) => sheet.headers.includes(field));
    validateSheetSchema(tab, sheet.headers, requestedFields);
    const scopedRows = sheet.records.filter(({ record }) => belongsToScope(record));
    const rowNumbers = scopedRows.map(({ rowNumber }) => rowNumber);
    let nextRow = Math.max(1, ...sheet.records.map(({ rowNumber }) => rowNumber)) + 1;
    for (let index = 0; index < Math.max(scopedRows.length, records.length); index += 1) {
      const rowNumber = rowNumbers[index] || nextRow++;
      const record = records[index];
      const updates = Object.fromEntries(fields.map((field) => [field, record?.[field] ?? ""]));
      validateFieldWrite(tab, sheet.headers, updates);
      for (const [field, value] of Object.entries(updates)) {
        const column = columnName(sheet.headers.indexOf(field));
        data.push({ range: `${tab}!${column}${rowNumber}`, values: [[normalizeWorkbookWriteValue(tab, field, value)]] });
      }
    }
    counts[tab] = records.length;
  }
  if (data.length) {
    metric("workbookWrites");
    await google("/values:batchUpdate", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }
  return counts;
}

const CALCUTTA_ROUND_RESULT_HEADERS = ["Year", "Round", "Format", "Player ID", "Gross Score", "Net Score", "Full Course Handicap", "Place", "Calcutta Points"];
const CALCUTTA_STANDINGS_HEADERS = ["Year", "Rank", "Player ID", "Purchase Price", "Round 1 Points", "Round 2 Points", "Round 3 Points", "Total Points", "Round 1 Payout %", "Round 2 Payout %", "Round 3 Payout %", "Total Payout %", "Current Payout Value", "ROI", "Updated At"];

async function readCalcuttaPublicationSheets(tabs) {
  try {
    return await readSheets(tabs);
  } catch (error) {
    if (Number(error?.status || 0) !== 400) throw error;
    const isolated = {};
    for (const tab of tabs) {
      try {
        isolated[tab] = await readSheet(tab);
      } catch (sheetError) {
        const failure = new Error(`Calcutta input worksheet '${tab}' could not be read: ${sheetError?.message || String(sheetError)}`, { cause: sheetError });
        failure.name = sheetError?.name || "GoogleReadError";
        failure.status = Number(sheetError?.status || 0);
        failure.category = sheetError?.category || "unknown";
        throw failure;
      }
    }
    return isolated;
  }
}

export async function publishOfficialCalcutta(yearValue, options = {}) {
  const year = Number(yearValue);
  const trace = {
    triggerFired: true, year, completedRoundDetected: false, purchasedGolfers: 0,
    generatedRoundResultRows: 0, firstFiveGeneratedRows: [], workbookWriteAttempted: false,
    targetWorksheets: ["Calcutta Round Results", "Calcutta Standings"],
    rowsSuccessfullyWritten: { roundResults: 0, standings: 0 }, readBackVerified: false,
    rowsPresentAfterWrite: { roundResults: 0, standings: 0 },
  };
  try {
  trace.stage = "environment-validation";
  requireIsolatedScoringSheet();
  if (!year) return { published: false, reason: "invalid-year", trace };
  trace.stage = "input-loading";
  const tabs = ["Live Round Handicaps", "Handicaps", "Calcutta Purchases", "Calcutta Ownership", "Calcutta Point Structure", "Calcutta Payout", "Calcutta Round Results", "Calcutta Standings"];
  const sheets = await readCalcuttaPublicationSheets(tabs);
  if (process.env.VERCEL_ENV === "preview") {
    trace.workbookSchemas = Object.fromEntries(["Calcutta Round Results", "Calcutta Standings"].map((tab) => {
      const expected = tab === "Calcutta Round Results" ? CALCUTTA_ROUND_RESULT_HEADERS : CALCUTTA_STANDINGS_HEADERS;
      const actual = sheets[tab]?.headers || [];
      return [tab, { expected, actual, missing: expected.filter((header) => !actual.includes(header)) }];
    }));
  }
  requireHeaders(sheets["Calcutta Round Results"], "Calcutta Round Results", CALCUTTA_ROUND_RESULT_HEADERS);
  requireHeaders(sheets["Calcutta Standings"], "Calcutta Standings", CALCUTTA_STANDINGS_HEADERS);
  const rows = (tab) => sheets[tab].records.map(({ record }) => record);
  const tournamentModel = options.tournamentModel || await (async () => {
    const { getTournamentData, invalidateTournamentDataCache } = await import("../app/live/sheetData.js");
    invalidateTournamentDataCache(["Live Matches", "Matches", "Live Hole Scores", "Tournaments", "Calcutta Round Results", "Calcutta Standings"]);
    return getTournamentData();
  })();
  const officialRoundResults = calcuttaRoundResultsFromTournamentModel({
    year,
    rounds: tournamentModel.rounds,
    scoreLeaderboard: tournamentModel.scoreLeaderboard,
  });
  trace.purchasedGolfers = new Set(rows("Calcutta Purchases")
    .filter((record) => Number(record.Year) === year)
    .map((record) => String(record["Golfer Player ID"] || "").trim())
    .filter(Boolean)).size;
  const output = calcuttaPublicationRecords({
    year,
    roundResults: officialRoundResults,
    liveRoundHandicaps: rows("Live Round Handicaps"),
    handicaps: rows("Handicaps"),
    purchases: rows("Calcutta Purchases"),
    ownership: rows("Calcutta Ownership"),
    pointStructure: rows("Calcutta Point Structure"),
    payoutStructure: rows("Calcutta Payout"),
  });
  trace.stage = "completed-round-detection";
  if (!output.roundResults.length) {
    const readiness = calcuttaPublicationReadiness({
      year,
      roundResults: officialRoundResults,
      liveRoundHandicaps: rows("Live Round Handicaps"),
      handicaps: rows("Handicaps"),
      purchases: rows("Calcutta Purchases"),
    });
    trace.readiness = readiness;
    trace.stopReason = readiness.purchasedPlayers.length
      ? "No completed round contains official tournament results for every purchased golfer."
      : "No purchased golfers exist for the active tournament year.";
    return { published: false, reason: "no-completed-rounds", year, readiness, trace };
  }
  const completedRounds = new Set(output.roundResults.map((record) => Number(record.Round)));
  trace.completedRoundDetected = true;
  trace.completedRounds = [...completedRounds].sort();
  trace.generatedRoundResultRows = output.roundResults.length;
  trace.generatedStandingsRows = output.standings.length;
  trace.firstFiveGeneratedRows = output.roundResults.slice(0, 5);
  trace.workbookWriteAttempted = true;
  trace.stage = "round-results-write";
  const written = await replaceScopedRuntimeRecordSets([
    {
      tab: "Calcutta Round Results", sheet: sheets["Calcutta Round Results"], records: output.roundResults,
      belongsToScope: (record) => Number(record.Year) === year && completedRounds.has(Number(record.Round)),
    },
    {
      tab: "Calcutta Standings", sheet: sheets["Calcutta Standings"], records: output.standings,
      belongsToScope: (record) => Number(record.Year) === year,
    },
  ]);
  trace.rowsSuccessfullyWritten.roundResults = written["Calcutta Round Results"];
  trace.rowsSuccessfullyWritten.standings = written["Calcutta Standings"];
  trace.stage = "workbook-read-back";
  const verification = await readSheets(["Calcutta Round Results", "Calcutta Standings"]);
  trace.rowsPresentAfterWrite.roundResults = verification["Calcutta Round Results"].records.filter(({ record }) => Number(record.Year) === year && completedRounds.has(Number(record.Round))).length;
  trace.rowsPresentAfterWrite.standings = verification["Calcutta Standings"].records.filter(({ record }) => Number(record.Year) === year).length;
  trace.readBackVerified = trace.rowsPresentAfterWrite.roundResults === output.roundResults.length
    && trace.rowsPresentAfterWrite.standings === output.standings.length;
  if (!trace.readBackVerified) {
    trace.stopReason = "Workbook read-back row counts do not match the generated output.";
    return { published: false, reason: "read-back-verification-failed", year, trace };
  }
  trace.stage = "publication-complete";
  return { published: true, year, completedRounds: [...completedRounds].sort(), roundResults: output.roundResults.length, standings: output.standings.length, trace };
  } catch (error) {
    trace.failureStage = trace.stage || "publication-start";
    trace.stopReason = error?.message || String(error);
    trace.exception = {
      name: error?.name || "Error",
      message: error?.message || String(error),
      status: Number(error?.status || 0),
      category: error?.category || "unknown",
      transient: isTransientGoogleError(error),
      stack: error?.stack || "Unavailable",
    };
    return { published: false, reason: "publication-failed", year, trace };
  }
}

async function synchronizeCalcuttaAfterOfficialUpdate(record, options = {}) {
  const attempts = 4;
  let result;
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsUsed = attempt;
    try {
      const attemptResult = await withWorkbookWriteDiagnostics("calcutta-publication", () => publishOfficialCalcutta(record?.Year, options));
      result = { ...attemptResult.result, requestDiagnostics: attemptResult.diagnostics };
      const retryable = result.reason === "no-completed-rounds" || result.trace?.exception?.transient;
      if (result.published || !retryable) break;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    } catch (error) {
      console.error("Calcutta publication failed", { stage: "workbook-publication", attempt, year: String(record?.Year || ""), reason: error?.message || String(error), stack: error?.stack });
      return { published: false, reason: "publication-failed" };
    }
  }
  console.info("Calcutta publication trace", {
    stage: result?.published ? "publication-complete" : "completed-round-detection",
    attempts: attemptsUsed,
    year: String(record?.Year || ""),
    result,
  });
  return result;
}

function requireHeaders(sheet, tab, required) {
  for (const header of required) {
    if (!sheet.headers.includes(header)) throw new Error(`${tab} is missing the ${header} column.`);
  }
}

const LIVE_HOLE_HEADERS = [
  "Hole Score ID", "Match ID", "Hole Number", "Stroke Index", "Format",
  "Team 1 Gross Scores", "Team 2 Gross Scores", "Team 1 Net Score", "Team 2 Net Score",
  "Hole Winner", "Revision", "Updated At", "Updated By",
];
const MATCH_ACCESS_HEADERS = [
  "Access Code Hash", "Access Token Hash", "Access Selector", "Access Active",
  "Access Expires At", "Access Version",
];
const PLAYER_PASSPORT_HEADERS = [
  "Tournament ID", "Player ID", "Invite Reference", "Activation Code Hash",
  "Activation Active", "Activation Expires At", "Activation Used At", "Passport Version",
  "Created At", "Updated At", "Updated By",
];
const TRUSTED_DEVICE_HEADERS = [
  "Device ID", "Tournament ID", "Player ID", "Session Version", "Created At",
  "Last Used At", "Expires At", "Revoked At", "Device Label",
  "PWA Installed", "PWA Installed At", "Notifications Enabled", "Notifications Updated At",
  "Notification Permission", "Push Subscription", "Subscription Updated At", "Device Last Seen",
];
const NOTIFICATION_LOG_HEADERS = [
  "Notification ID", "Notification Type", "Tournament ID", "Player ID", "Device ID",
  "Recipient", "Time Sent", "Delivery Status", "Failure", "Notification Preview Template",
];

function requireIsolatedScoringSheet() {
  assertLiveScoringWriteEnvironment();
}

export const assertLiveScoringTestEnvironment = requireIsolatedScoringSheet;

export async function initializeLiveScoringTestSchema() {
  requireIsolatedScoringSheet();
  await requireTabHeaders("Live Hole Scores", LIVE_HOLE_HEADERS);
  await requireTabHeaders("Live Matches", [
    ...LIVE_MATCH_CORE_SCORE_HEADERS, ...MATCH_ACCESS_HEADERS, "Finalized At", "Finalized By",
  ]);
  return { ok: true };
}

function scoringPlayers(match, side) {
  return [1, 2].flatMap((slot) => {
    const id = String(match[`Team ${side} Player ${slot}`] || "").trim();
    return id ? [{
      id,
      strokes: Number(match[`Team ${side} Player ${slot} Stroke`] || 0),
      playingHcp: Number(match[`Team ${side} Player ${slot} Playing HCP`] || 0),
    }] : [];
  });
}

export async function authenticateLiveMatchCode(code) {
  requireIsolatedScoringSheet();
  const sheet = await readSheet("Live Matches");
  requireHeaders(sheet, "Live Matches", ["Match ID", "Access Code Hash"]);
  const salt = process.env.SCORING_ACCESS_CODE_SALT;
  if (!salt) throw new Error("SCORING_ACCESS_CODE_SALT is not configured.");
  const found = sheet.records.filter(({ record }) =>
    record["Access Code Hash"] && accessCodeMatches(code, record["Access Code Hash"], salt)
  );
  if (found.length !== 1) throw new Error("Invalid match code.");
  return found[0].record["Match ID"];
}

const truthy = (value) => ["true", "yes", "1", "active"].includes(String(value || "").trim().toLowerCase());
const accessSalt = () => {
  const salt = process.env.SCORING_ACCESS_CODE_SALT;
  if (!salt) throw new Error("Scoring access is not configured.");
  return salt;
};
const accessExpired = (record, now = Date.now()) => {
  const expires = Date.parse(String(record["Access Expires At"] || ""));
  return Number.isFinite(expires) && expires <= now;
};

export async function readParticipantMatchOptions() {
  requireIsolatedScoringSheet();
  const [matches, players, teams] = await Promise.all([
    requireTabHeaders("Live Matches", ["Match ID", ...MATCH_ACCESS_HEADERS]),
    readSheet("Players"),
    readSheet("Team Names"),
  ]);
  requireHeaders(matches, "Live Matches", ["Match ID", "Round", "Match", "Access Selector"]);
  const rows = matches.records.map(({ record }) => record);
  const incomplete = rows.filter((row) => !["final", "finalized"].includes(String(row["Match Status"] || "").toLowerCase()));
  const activeRound = Math.min(...incomplete.map((row) => Number(row.Round)).filter(Number.isFinite));
  const names = Object.fromEntries(players.records.map(({ record }) => [
    record["Player ID"], record["Display Name"] || record["Player ID"],
  ]));
  const teamName = (year, side) => {
    const row = teams.records.map(({ record }) => record).find((item) =>
      String(item.Year) === String(year) && String(item["Team Side"]).includes(String(side))
    );
    return row?.["Team Names"] || row?.["Team Name"] || `Team ${side}`;
  };
  return {
    activeRound: Number.isFinite(activeRound) ? activeRound : null,
    matches: rows
      .filter((row) => !Number.isFinite(activeRound) || Number(row.Round) === activeRound)
      .map((row) => ({
        selector: String(row["Access Selector"] || ""),
        round: row.Round,
        match: row.Match,
        format: row.Format,
        teeTime: row["Tee Time"] || "",
        course: row["Course ID"] || "",
        teamOne: teamName(row.Year, 1),
        teamTwo: teamName(row.Year, 2),
        teamOnePlayers: [row["Team 1 Player 1"], row["Team 1 Player 2"]].filter(Boolean).map((id) => names[id] || id),
        teamTwoPlayers: [row["Team 2 Player 1"], row["Team 2 Player 2"]].filter(Boolean).map((id) => names[id] || id),
        accessAvailable: truthy(row["Access Active"]) && !accessExpired(row) && Boolean(row["Access Selector"]),
      })),
  };
}

export async function authenticateParticipantMatch({ selector, code, token }) {
  requireIsolatedScoringSheet();
  const sheet = await readSheet("Live Matches");
  requireHeaders(sheet, "Live Matches", ["Match ID", ...MATCH_ACCESS_HEADERS]);
  const matches = sheet.records.filter(({ record }) =>
    token ? accessTokenMatches(token, record["Access Token Hash"], accessSalt())
      : String(record["Access Selector"] || "") === String(selector || "")
  );
  if (matches.length !== 1) throw new Error("Unable to authorize this match.");
  const record = matches[0].record;
  if (!truthy(record["Access Active"]) || accessExpired(record)) throw new Error("Unable to authorize this match.");
  if (!token && !accessCodeMatches(code, record["Access Code Hash"], accessSalt())) {
    throw new Error("Unable to authorize this match.");
  }
  return { matchId: record["Match ID"], accessVersion: Number(record["Access Version"]) || 0 };
}

export async function validateParticipantSession(session, { requireWritable = false } = {}) {
  if (session?.scope === "admin") return session;
  const sheet = await readSheet("Live Matches");
  const current = findUniqueMatch(sheet, session?.matchId).record;
  if (!participantSessionMatchesAccess(session, current)) {
    throw new Error("Match access has expired or been replaced.");
  }
  if (requireWritable && session?.readOnly === true) throw new Error("This scorecard is read-only.");
  if (requireWritable && ["final", "finalized"].includes(String(current["Match Status"] || "").toLowerCase())) {
    throw new Error("This match is finalized and locked.");
  }
  return session;
}

export async function generateLiveMatchAccess(matchIdValue, updatedByValue) {
  requireIsolatedScoringSheet();
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders("Live Matches", ["Match ID", ...MATCH_ACCESS_HEADERS]);
  const current = findUniqueMatch(sheet, String(matchIdValue || "").trim());
  const code = String(randomInt(100000, 1000000));
  const token = randomBytes(32).toString("base64url");
  const selector = randomBytes(12).toString("base64url");
  const version = Number(current.record["Access Version"] || 0) + 1;
  const updatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const updates = {
    "Access Code Hash": hashAccessCode(code, accessSalt()),
    "Access Token Hash": hashAccessToken(token, accessSalt()),
    "Access Selector": selector,
    "Access Active": "TRUE",
    "Access Expires At": expiresAt,
    "Access Version": version,
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  };
  await writeSheetFields("Live Matches", sheet.headers, current.rowNumber, updates);
  await logMatchUpdate({ matchId: matchIdValue, action: "Participant Access Generated", previous: { active: current.record["Access Active"], version: current.record["Access Version"] }, next: { active: true, version, expiresAt }, updatedBy, updatedAt });
  return { match: { ...current.record, ...updates }, code, token, selector, expiresAt };
}

export async function disableLiveMatchAccess(matchIdValue, updatedByValue) {
  requireIsolatedScoringSheet();
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders("Live Matches", ["Match ID", ...MATCH_ACCESS_HEADERS]);
  const current = findUniqueMatch(sheet, String(matchIdValue || "").trim());
  const version = Number(current.record["Access Version"] || 0) + 1;
  const updatedAt = new Date().toISOString();
  const updates = { "Access Active": "FALSE", "Access Version": version, "Updated At": updatedAt, "Updated By": updatedBy };
  await writeSheetFields("Live Matches", sheet.headers, current.rowNumber, updates);
  await logMatchUpdate({ matchId: matchIdValue, action: "Participant Access Disabled", previous: { active: current.record["Access Active"] }, next: { active: false, version }, updatedBy, updatedAt });
  return { ...current.record, ...updates };
}

export async function enableLiveMatchAccess(matchIdValue, updatedByValue) {
  requireIsolatedScoringSheet();
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders("Live Matches", ["Match ID", ...MATCH_ACCESS_HEADERS]);
  const current = findUniqueMatch(sheet, String(matchIdValue || "").trim());
  const updatedAt = new Date().toISOString();
  const currentExpiry = Date.parse(String(current.record["Access Expires At"] || ""));
  const expiresAt = Number.isFinite(currentExpiry) && currentExpiry > Date.now()
    ? current.record["Access Expires At"]
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const updates = {
    "Access Active": "TRUE",
    "Access Expires At": expiresAt,
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  };
  await writeSheetFields("Live Matches", sheet.headers, current.rowNumber, updates);
  await logMatchUpdate({
    matchId: matchIdValue,
    action: "Participant Access Enabled",
    previous: { active: current.record["Access Active"], expiresAt: current.record["Access Expires At"] },
    next: { active: true, expiresAt },
    updatedBy,
    updatedAt,
  });
  return { ...current.record, ...updates };
}

async function passportTournamentContext(loadedSheets) {
  requireIsolatedScoringSheet();
  const sheets = loadedSheets || await readSheets(["Tournaments", "Players", "Handicaps", "Live Matches"]);
  const { Tournaments: tournaments, Players: players, Handicaps: handicaps, "Live Matches": liveMatches } = sheets;
  const tournament = tournaments.records.map(({ record }) => record)
    .filter((record) => tournamentYear(record))
    .sort((a, b) => tournamentYear(b) - tournamentYear(a))[0];
  if (!tournament) throw new Error("No tournament is available for Player Passport.");
  const year = tournamentYear(tournament);
  const tournamentIdValue = tournamentId(tournament);
  const activePlayers = new Map(players.records.map(({ record }) => [
    String(record["Player ID"] || ""),
    {
      id: String(record["Player ID"] || ""),
      name: record["Display Name"] || record.Name || record["Player ID"],
      slug: String(record.Slug || ""),
      photo: String(record["Photo Filename"] || record.Photo || ""),
      active: !record.Active || truthy(record.Active),
    },
  ]));
  const rosterIds = new Set(handicaps.records.map(({ record }) => record)
    .filter((record) => String(record.Year || "") === String(year))
    .map((record) => String(record["Player ID"] || ""))
    .filter(Boolean));
  if (!rosterIds.size) {
    for (const { record } of liveMatches.records) {
      if (String(record.Year || "") !== String(year)) continue;
      for (const side of [1, 2]) for (const slot of [1, 2]) {
        const id = String(record[`Team ${side} Player ${slot}`] || "");
        if (id) rosterIds.add(id);
      }
    }
  }
  return {
    tournament,
    tournamentId: tournamentIdValue,
    year,
    players: [...rosterIds].map((id) => activePlayers.get(id)).filter((player) => player?.active),
    handicaps: handicaps.records.map(({ record }) => record)
      .filter((record) => String(record.Year || "") === String(year)),
    liveMatches: liveMatches.records.map(({ record }) => record).filter((record) => String(record.Year || "") === String(year)),
  };
}

export async function readPlayerPassportActivationOptions(inviteReference = "") {
  const context = await passportTournamentContext();
  const passports = await requireTabHeaders("Player Passport", PLAYER_PASSPORT_HEADERS);
  const byPlayer = new Map(passports.records
    .map(({ record }) => record)
    .filter((record) => String(record["Tournament ID"]) === String(context.tournamentId))
    .map((record) => [String(record["Player ID"]), record]));
  const players = context.players.map((player) => {
    const passport = byPlayer.get(player.id);
    return {
      name: player.name,
      reference: truthy(passport?.["Activation Active"]) ? passport["Invite Reference"] : "",
      activationAvailable: truthy(passport?.["Activation Active"]) && !accessExpired({
        "Access Expires At": passport?.["Activation Expires At"],
      }),
    };
  });
  const selected = players.find((player) => player.reference && player.reference === String(inviteReference || "")) || null;
  return {
    tournament: {
      id: context.tournamentId,
      year: context.year,
      name: context.tournament["Tournament Name"] || context.tournament.Name || "Sandbagger Invitational",
    },
    players,
    selectedReference: selected?.reference || "",
  };
}

export async function generatePlayerPassport(playerIdValue, updatedByValue) {
  const context = await passportTournamentContext();
  const playerId = String(playerIdValue || "").trim();
  if (!context.players.some((player) => player.id === playerId)) throw new Error("Player is not eligible for this tournament.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders("Player Passport", PLAYER_PASSPORT_HEADERS);
  const current = sheet.records.find(({ record }) =>
    String(record["Tournament ID"]) === String(context.tournamentId) && String(record["Player ID"]) === playerId
  );
  const code = String(randomInt(100000, 1000000));
  const reference = randomBytes(18).toString("base64url");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  // Activation-code rotation must not revoke already trusted devices. Device
  // revocation is handled separately through Trusted Devices.
  const version = Number(current?.record?.["Passport Version"] || 1);
  const record = {
    ...(current?.record || {}),
    "Tournament ID": context.tournamentId,
    "Player ID": playerId,
    "Invite Reference": reference,
    "Activation Code Hash": hashAccessCode(code, accessSalt()),
    "Activation Active": "TRUE",
    "Activation Expires At": expiresAt,
    "Activation Used At": "",
    "Passport Version": version,
    "Created At": current?.record?.["Created At"] || now,
    "Updated At": now,
    "Updated By": updatedBy,
  };
  if (current) await writeSheetFields("Player Passport", sheet.headers, current.rowNumber, record);
  else await appendSheetFields("Player Passport", sheet, record);
  await appendAdminAudit({ resource: "player-passport", recordId: `${context.tournamentId}:${playerId}`, action: current ? "Activation Regenerated" : "Activation Generated", previous: current?.record || {}, next: { active: true, version, expiresAt }, updatedBy, summary: "Player Passport" });
  return { playerId, code, reference, expiresAt, version };
}

export async function generateMissingPlayerPassports(updatedByValue) {
  const context = await passportTournamentContext();
  const sheet = await requireTabHeaders("Player Passport", PLAYER_PASSPORT_HEADERS);
  const existing = new Set(sheet.records.map(({ record }) =>
    String(record["Tournament ID"]) === String(context.tournamentId) ? String(record["Player ID"]) : ""
  ));
  const generated = [];
  for (const player of context.players) {
    if (!existing.has(player.id)) generated.push({ player, ...(await generatePlayerPassport(player.id, updatedByValue)) });
  }
  return generated;
}

export async function readPlayerPassportAdminData() {
  const context = await passportTournamentContext();
  const [passports, devices] = await Promise.all([
    requireTabHeaders("Player Passport", PLAYER_PASSPORT_HEADERS),
    requireTabHeaders("Trusted Devices", TRUSTED_DEVICE_HEADERS),
  ]);
  return {
    tournament: { id: context.tournamentId, year: context.year, name: context.tournament["Tournament Name"] || "Sandbagger Invitational" },
    players: context.players.map((player) => {
      const passport = passports.records.find(({ record }) =>
        String(record["Tournament ID"]) === String(context.tournamentId) && String(record["Player ID"]) === player.id
      )?.record;
      const trustedDevices = devices.records.filter(({ record }) =>
        String(record["Tournament ID"]) === String(context.tournamentId) &&
        String(record["Player ID"]) === player.id &&
        !record["Revoked At"]
      );
      return {
        ...player,
        activationActive: truthy(passport?.["Activation Active"]),
        activationExpiresAt: passport?.["Activation Expires At"] || "",
        activationUsedAt: passport?.["Activation Used At"] || "",
        reference: passport?.["Invite Reference"] || "",
        version: Number(passport?.["Passport Version"] || 0),
        trustedDeviceCount: trustedDevices.length,
        trustedDevices: trustedDevices.map(({ record }) => ({
          id: record["Device ID"], label: record["Device Label"] || "Trusted device",
          createdAt: record["Created At"], lastUsedAt: record["Last Used At"], expiresAt: record["Expires At"],
        })),
      };
    }),
  };
}

export async function activatePlayerPassport({ reference, code, deviceLabel = "" }) {
  const context = await passportTournamentContext();
  const passports = await readSheet("Player Passport");
  let current = passports.records.find(({ record }) =>
    String(record["Tournament ID"]) === String(context.tournamentId) &&
    String(record["Invite Reference"]) === String(reference || "")
  );
  const activationFailure = (reason) => Object.assign(
    new Error("Unable to activate Player Passport."),
    { code: reason }
  );
  if (!current) {
    // A participant may keep an invitation page open while an admin regenerates
    // its one-time credentials. In that case the page has the old opaque
    // reference but the newly issued code is still authoritative. Resolve the
    // one active Passport whose stored hash matches, without exposing Player IDs.
    const codeMatches = passports.records.filter(({ record }) => {
      if (String(record["Tournament ID"]) !== String(context.tournamentId) ||
          !truthy(record["Activation Active"]) ||
          accessExpired({ "Access Expires At": record["Activation Expires At"] }) ||
          !record["Activation Code Hash"]) return false;
      try {
        return accessCodeMatches(code, record["Activation Code Hash"], accessSalt());
      } catch {
        return false;
      }
    });
    if (codeMatches.length === 1) current = codeMatches[0];
  }
  const record = current?.record;
  if (!record) throw activationFailure("PASSPORT_REFERENCE_NOT_FOUND");
  if (!truthy(record["Activation Active"])) throw activationFailure("PASSPORT_ACTIVATION_INACTIVE");
  if (accessExpired({ "Access Expires At": record["Activation Expires At"] })) {
    throw activationFailure("PASSPORT_ACTIVATION_EXPIRED");
  }
  if (!record["Activation Code Hash"]) throw activationFailure("PASSPORT_CODE_HASH_MISSING");
  if (!accessCodeMatches(code, record["Activation Code Hash"], accessSalt())) {
    throw activationFailure("PASSPORT_CODE_MISMATCH");
  }
  const player = context.players.find((item) => item.id === String(record["Player ID"]));
  if (!player) throw activationFailure("PASSPORT_PLAYER_NOT_ELIGIBLE");
  const devices = await requireTabHeaders("Trusted Devices", TRUSTED_DEVICE_HEADERS);
  const deviceId = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const device = {
    "Device ID": deviceId, "Tournament ID": context.tournamentId, "Player ID": player.id,
    "Session Version": Number(record["Passport Version"] || 1), "Created At": now,
    "Last Used At": now, "Expires At": expiresAt, "Revoked At": "",
    "Device Label": String(deviceLabel || "Browser / PWA").slice(0, 80),
  };
  await appendSheetFields("Trusted Devices", devices, device);
  await writeSheetFields("Player Passport", passports.headers, current.rowNumber, {
    "Activation Active": "FALSE",
    "Activation Used At": now,
    "Updated At": now,
    "Updated By": player.name,
  });
  try {
    await appendAdminAudit({ resource: "player-passport", recordId: `${context.tournamentId}:${player.id}`, action: "Device Activated", previous: {}, next: { deviceId, expiresAt }, updatedBy: player.name, summary: "Player Passport" });
  } catch (error) {
    // The trusted-device row and one-time activation state are authoritative.
    // An audit-sheet failure must not make a completed activation look failed.
    console.error("Player Passport activation audit failed", {
      reason: error instanceof Error ? error.message : String(error),
      tournamentId: context.tournamentId,
      playerId: player.id,
    });
  }
  return {
    player,
    playerId: player.id,
    tournamentId: context.tournamentId,
    deviceId,
    sessionVersion: device["Session Version"],
    expiresAt,
  };
}

export async function resolvePreviewImpersonationIdentity(session, loadedSheets) {
  if (!isPreviewImpersonationSession(session)) throw new Error("Preview identity is not active.");
  const previewPlayers = loadedSheets?.Players || await readSheet("Players");
  const previewPlayer = previewPlayerFromRecords(session.impersonatedPlayerId, previewPlayers.records.map(({ record }) => record));
  if (!previewPlayer?.active) throw new Error("Preview player is no longer active.");
  return {
    session,
    device: null,
    passport: null,
    player: { ...previewPlayer, role: normalizePlayerRole(previewPlayer.role) },
    actor: session.previewDirector,
    impersonating: true,
    previewMode: true,
  };
}

export async function validatePlayerPassport(session, loadedSheets) {
  if (isPreviewImpersonationSession(session)) return resolvePreviewImpersonationIdentity(session, loadedSheets);
  const sheets = loadedSheets || await readSheets(["Trusted Devices", "Player Passport", "Players"]);
  const { "Trusted Devices": devices, "Player Passport": passports, Players: players } = sheets;
  const device = devices.records.find(({ record }) => String(record["Device ID"]) === String(session?.deviceId))?.record;
  const passport = passports.records.find(({ record }) =>
    String(record["Tournament ID"]) === String(session?.tournamentId) &&
    String(record["Player ID"]) === String(session?.playerId)
  )?.record;
  const player = players.records.find(({ record }) => String(record["Player ID"]) === String(session?.playerId))?.record;
  const deviceExpires = Date.parse(String(device?.["Expires At"] || ""));
  if (!device || device["Revoked At"] || (Number.isFinite(deviceExpires) && deviceExpires <= Date.now()) ||
      Number(device["Session Version"]) !== Number(session?.sessionVersion) ||
      !passport ||
      Number(passport["Passport Version"]) !== Number(session?.sessionVersion) ||
      !player || (player.Active && !truthy(player.Active))) {
    throw new Error("Player Passport is no longer active.");
  }
  const actor = {
    id: session.playerId,
    name: player["Display Name"] || player.Name || session.playerId,
    slug: String(player.Slug || ""),
    photo: String(player["Photo Filename"] || player.Photo || ""),
    role: normalizePlayerRole(player.Role),
  };
  const impersonatedPlayerId = String(session?.impersonatedPlayerId || "").trim();
  if (impersonatedPlayerId && (process.env.VERCEL_ENV !== "preview" || actor.role !== "DIRECTOR")) {
    throw new Error("Player Passport is no longer active.");
  }
  const impersonated = impersonatedPlayerId
    ? players.records.find(({ record }) => String(record["Player ID"]) === impersonatedPlayerId)?.record
    : null;
  if (impersonatedPlayerId && (!impersonated || (impersonated.Active && !truthy(impersonated.Active)))) {
    throw new Error("Player Passport is no longer active.");
  }
  const resolvedPlayer = impersonated ? {
    id: impersonatedPlayerId,
    name: impersonated["Display Name"] || impersonated.Name || impersonatedPlayerId,
    slug: String(impersonated.Slug || ""),
    photo: String(impersonated["Photo Filename"] || impersonated.Photo || ""),
    role: normalizePlayerRole(impersonated.Role),
  } : actor;
  return {
    session,
    device,
    passport,
    player: resolvedPlayer,
    actor,
    impersonating: Boolean(impersonated),
  };
}

export async function updatePlayerReadiness(session, input = {}) {
  requireIsolatedScoringSheet();
  const identity = await validatePlayerPassport(session);
  const sheet = await requireTabHeaders("Trusted Devices", TRUSTED_DEVICE_HEADERS);
  const current = sheet.records.find(({ record }) =>
    String(record["Device ID"] || "") === String(session.deviceId || "") &&
    String(record["Tournament ID"] || "") === String(session.tournamentId || "") &&
    String(record["Player ID"] || "") === String(session.playerId || "") &&
    !record["Revoked At"]
  );
  if (!current) throw new Error("Player Passport is no longer active.");
  const now = new Date().toISOString();
  const updates = { "Device Last Seen": now };
  if (input.pwaInstalled === true) {
    updates["PWA Installed"] = "TRUE";
    updates["PWA Installed At"] = now;
  }
  if (typeof input.notificationPermission === "string") {
    const permission = String(input.notificationPermission).toLowerCase();
    if (!["default", "granted", "denied"].includes(permission)) throw new Error("Notification permission is invalid.");
    updates["Notification Permission"] = permission;
    if (permission !== "granted") updates["Push Subscription"] = "";
    updates["Notifications Updated At"] = now;
  }
  if (Object.hasOwn(input, "pushSubscription")) {
    const parsed = input.pushSubscription ? parsePushSubscription(input.pushSubscription) : null;
    if (input.pushSubscription && !parsed) throw new Error("Push subscription is invalid.");
    updates["Push Subscription"] = parsed ? JSON.stringify(parsed) : "";
    updates["Subscription Updated At"] = now;
  }
  const merged = { ...current.record, ...updates };
  updates["Notifications Enabled"] = notificationReady(merged) ? "TRUE" : "FALSE";
  if (typeof input.notificationPermission === "string" || Object.hasOwn(input, "pushSubscription")) updates["Notifications Updated At"] = now;
  if (Object.keys(updates).length) await writeSheetFields("Trusted Devices", sheet.headers, current.rowNumber, updates);
  return {
    playerId: identity.player.id,
    pwaInstalled: truthy(updates["PWA Installed"] || current.record["PWA Installed"]),
    notificationPermission: merged["Notification Permission"] || "default",
    pushSubscriptionValid: Boolean(parsePushSubscription(merged["Push Subscription"])),
    notificationsEnabled: notificationReady(merged),
    notificationReady: notificationReady(merged),
  };
}

export async function currentPushDevice(session) {
  const identity = await validatePlayerPassport(session);
  const sheet = await requireTabHeaders("Trusted Devices", TRUSTED_DEVICE_HEADERS);
  const row = sheet.records.find(({ record }) =>
    String(record["Device ID"] || "") === String(session.deviceId || "") &&
    String(record["Tournament ID"] || "") === String(session.tournamentId || "") &&
    String(record["Player ID"] || "") === String(session.playerId || "") && !record["Revoked At"]
  );
  if (!row) throw new Error("Player Passport is no longer active.");
  return { identity, sheet, row, subscription: parsePushSubscription(row.record["Push Subscription"]), ready: notificationReady(row.record) };
}

export async function invalidatePushDevice(session) {
  requireIsolatedScoringSheet();
  const current = await currentPushDevice(session);
  const now = new Date().toISOString();
  await writeSheetFields("Trusted Devices", current.sheet.headers, current.row.rowNumber, {
    "Push Subscription": "", "Notifications Enabled": "FALSE", "Subscription Updated At": now, "Notifications Updated At": now, "Device Last Seen": now,
  });
}

export async function appendNotificationLog(session, { type = "Test", recipient = "Authenticated device", status, failure = "", template = "" } = {}) {
  requireIsolatedScoringSheet();
  const sheet = await requireTabHeaders("Notification Log", NOTIFICATION_LOG_HEADERS);
  await appendSheetFields("Notification Log", sheet, {
    "Notification ID": randomUUID(), "Notification Type": type, "Tournament ID": session.tournamentId,
    "Player ID": session.playerId, "Device ID": session.deviceId, "Recipient": recipient,
    "Time Sent": new Date().toISOString(), "Delivery Status": status, "Failure": failure, "Notification Preview Template": template,
  });
}

export async function readNotificationLog(limit = 20) {
  const sheet = await requireTabHeaders("Notification Log", NOTIFICATION_LOG_HEADERS);
  return sheet.records.map(({ record }) => ({
    id: record["Notification ID"], type: record["Notification Type"], recipient: record.Recipient,
    sentAt: record["Time Sent"], status: record["Delivery Status"], failure: record.Failure || "", template: record["Notification Preview Template"] || "",
  })).filter((item) => item.id).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, limit);
}

export async function readTournamentReadiness() {
  const context = await passportTournamentContext();
  const [passports, devices] = await Promise.all([
    requireTabHeaders("Player Passport", PLAYER_PASSPORT_HEADERS),
    requireTabHeaders("Trusted Devices", TRUSTED_DEVICE_HEADERS),
  ]);
  return tournamentReadiness({
    tournamentId: context.tournamentId,
    players: context.players,
    passports: passports.records.map(({ record }) => record),
    devices: devices.records.map(({ record }) => record),
    handicaps: context.handicaps,
    matches: context.liveMatches,
  });
}

export async function readPlayerPassportMatches(session, { onTiming } = {}) {
  const personalizedStartedAt = Date.now();
  const passportStartedAt = Date.now();
  const previewMode = isPreviewImpersonationSession(session);
  const sheets = await readSheets(previewMode
    ? ["Players", "Tournaments", "Handicaps", "Live Matches", "Courses", "Team Names", "Live Hole Scores"]
    : ["Trusted Devices", "Player Passport", "Players", "Tournaments", "Handicaps", "Live Matches", "Courses", "Team Names", "Live Hole Scores"]);
  const identity = await validatePlayerPassport(session, sheets);
  const passportLookupMs = Date.now() - passportStartedAt;
  const context = await passportTournamentContext(sheets);
  if (String(context.tournamentId) !== String(session.tournamentId)) throw new Error("Player is not active in this tournament.");
  const { Players: players, Courses: courses, "Team Names": teams, "Live Hole Scores": holes } = sheets;
  const playerNames = Object.fromEntries(players.records.map(({ record }) => [
    String(record["Player ID"] || ""), String(record["Display Name"] || record.Name || record["Player ID"] || ""),
  ]));
  const playerSlugs = Object.fromEntries(players.records.map(({ record }) => [
    String(record["Player ID"] || ""), String(record.Slug || ""),
  ]));
  const courseDetails = Object.fromEntries(courses.records.map(({ record }) => [
    String(record["Course ID"] || ""),
    {
      name: String(record["Course Name"] || record.Course || record["Full Course Name"] || record.Name || ""),
      logo: String(record["Course Logo"] || record["Logo Filename"] || ""),
      tee: String(record["Tee Played"] || record.Tee || ""),
    },
  ]));
  const teamRecords = teams.records.map(({ record }) => record)
    .filter((record) => recordBelongsToTournament(record, context.tournamentId, context.year));
  const teamNameFor = (side) => {
    const record = teamRecords.find((item) =>
      String(item["Team Side"] || "").match(/\d+/)?.[0] === String(side)
    );
    return String(record?.["Team Names"] || record?.["Team Name"] || `Team ${side}`);
  };
  const teamLogoFor = (side) => {
    const record = teamRecords.find((item) =>
      String(item["Team Side"] || "").match(/\d+/)?.[0] === String(side)
    );
    return String(record?.["Logo Filename"] || record?.["Team Logo"] || "");
  };
  const currentRound = String(context.tournament["Current Round"] || context.tournament["Current Round Number"] || "");
  const formatName = (value) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[String(value || "").toUpperCase()] || String(value || "");
  const matchModels = context.liveMatches.filter((match) => playerAppearsInMatch(match, identity.player.id)).map((match) => {
    const {
      side,
      participantIds: sideParticipantIds,
      partnerIds: teammateIds,
      opponentIds,
    } = playerMatchSides(match, identity.player.id);
    const matchHoles = holes.records.map(({ record }) => record)
      .filter((row) => String(row["Match ID"] || "") === String(match["Match ID"] || ""));
    const completedHoles = matchHoles.map((row) => Number(row["Hole Number"])).filter(Number.isFinite);
    const status = String(match["Match Status"] || "Scheduled");
    const isFinal = ["final", "finalized", "complete", "completed"].includes(status.toLowerCase());
    const teamOneHoles = Number(match["Team 1 Holes Won"] || 0);
    const teamTwoHoles = Number(match["Team 2 Holes Won"] || 0);
    const teamOnePoints = Number(match["Team 1 Points"] || 0);
    const teamTwoPoints = Number(match["Team 2 Points"] || 0);
    const officialWinner = String(match["18-Hole Winner"] || match["Matchup Winner"] || "").trim().toLowerCase();
    const winner = ["halved", "half", "tie", "tied"].includes(officialWinner)
      ? "Halved"
      : ["team 1", "team1", "1", teamNameFor(1).toLowerCase()].includes(officialWinner)
        ? teamNameFor(1)
        : ["team 2", "team2", "2", teamNameFor(2).toLowerCase()].includes(officialWinner)
          ? teamNameFor(2)
          : teamOnePoints === teamTwoPoints ? "Halved" : teamOnePoints > teamTwoPoints ? teamNameFor(1) : teamNameFor(2);
    const course = courseDetails[String(match["Course ID"] || "")] || {};
    const opponentSide = side === 1 ? 2 : 1;
    const officialResult = isFinal
      ? finalizedMatchResult(match, matchHoles, { 1: teamNameFor(1), 2: teamNameFor(2) })
      : "";
    return {
      selector: match["Access Selector"] || "",
      matchId: match["Match ID"],
      round: match.Round, match: match.Match, format: formatName(match.Format),
      course: course.name || "",
      courseLogo: course.logo || "",
      courseId: match["Course ID"] || "",
      tee: String(match["Tee Played"] || match.Tee || course.tee || ""),
      teeTime: match["Tee Time"] || "",
      teeTimeAt: match["Tee Time At"] || match["Scheduled At"] || "",
      status,
      accessActive: truthy(match["Access Active"]),
      scoringEnabled: truthy(match["Access Active"]) && !accessExpired(match) && !isFinal,
      currentHole: Number(match["Current Hole"] || Math.max(0, ...completedHoles)),
      holesRecorded: completedHoles.length,
      updatedAt: match["Updated At"] || "",
      updatedBy: match["Updated By"] || "",
      team: { side, name: teamNameFor(side), logo: teamLogoFor(side) },
      opponentTeam: { side: opponentSide, name: teamNameFor(opponentSide), logo: teamLogoFor(opponentSide) },
      partnerNames: teammateIds.map((id) => playerNames[id] || id),
      opponentNames: opponentIds.map((id) => playerNames[id] || id),
      participantNames: sideParticipantIds.map((id) => playerNames[id] || id),
      result: isFinal ? {
        label: winner === "Halved" ? `Match halved ${teamOnePoints}–${teamTwoPoints}` : `${winner} win ${teamOnePoints}–${teamTwoPoints}`,
        officialResult,
        winner,
        statusText: String(match["Match Status Text"] || match["Overall Result"] || match["Match Result"] || ""),
        teamOnePoints, teamTwoPoints, teamOneHoles, teamTwoHoles,
        playerPoints: side === 1 ? teamOnePoints : teamTwoPoints,
      } : null,
    };
  });
  const completed = matchModels.filter((match) => match.result);
  const points = completed.reduce((total, match) => total + Number(match.result.playerPoints || 0), 0);
  const playerHandicap = context.handicaps.find((record) =>
    String(record["Player ID"] || "") === String(identity.player.id)
  )?.["Tournament Handicap"];
  const result = {
    readiness: previewMode ? {
      passportActivated: true,
      pwaInstalled: true,
      notificationPermission: "granted",
      pushSubscriptionValid: true,
      notificationsEnabled: true,
      notificationReady: true,
    } : {
      passportActivated: true,
      pwaInstalled: truthy(identity.device?.["PWA Installed"]),
      notificationPermission: identity.device?.["Notification Permission"] || "default",
      pushSubscriptionValid: Boolean(parsePushSubscription(identity.device?.["Push Subscription"])),
      notificationsEnabled: notificationReady(identity.device),
      notificationReady: notificationReady(identity.device),
    },
    player: {
      ...identity.player,
      slug: playerSlugs[String(identity.player.id)] || "",
      teamName: matchModels[0]?.team?.name || "",
      teamLogo: matchModels[0]?.team?.logo || "",
      tournamentHandicap: playerHandicap === "" || playerHandicap === undefined ? null : playerHandicap,
    },
    tournament: {
      id: context.tournamentId,
      year: context.year,
      name: context.tournament["Tournament Name"] || "Sandbagger Invitational",
      status: String(context.tournament["Tournament Status"] || ""),
      currentRound,
      timeZone: context.tournament["Time Zone"] || "America/Chicago",
      logo: String(
        context.tournament["Tournament Logo Filename"] ||
        context.tournament["Logo Filename"] ||
        `sandbagger-${context.year}`
      ),
    },
    matches: matchModels,
    snapshot: completed.length ? {
      matchesPlayed: completed.length,
      points,
      record: {
        wins: completed.filter((match) => match.result.winner === match.team.name).length,
        halves: completed.filter((match) => match.result.winner === "Halved").length,
        losses: completed.filter((match) => !["Halved", match.team.name].includes(match.result.winner)).length,
      },
    } : null,
  };
  onTiming?.({
    passportLookupMs,
    personalizedDataMs: Math.max(0, Date.now() - personalizedStartedAt - passportLookupMs),
  });
  return result;
}

export async function authorizePassportMatch(session, matchIdValue, { allowFinal = false } = {}) {
  const identity = await validatePlayerPassport(session);
  const sheet = await readSheet("Live Matches");
  const match = findUniqueMatch(sheet, String(matchIdValue || "")).record;
  const isFinal = ["final", "finalized"].includes(String(match["Match Status"] || "").toLowerCase());
  const scoringAccessActive = truthy(match["Access Active"]) && !accessExpired(match);
  if (!playerAppearsInMatch(match, identity.player.id) ||
      (!scoringAccessActive && !(allowFinal && isFinal)) ||
      (!allowFinal && isFinal)) {
    throw new Error("This match is not available for Player Passport scoring.");
  }
  return { player: identity.player, matchId: match["Match ID"], accessVersion: Number(match["Access Version"] || 0), readOnly: allowFinal && isFinal };
}

export async function revokePlayerPassportDevices(playerIdValue, updatedByValue, deviceIdValue = "") {
  const context = await passportTournamentContext();
  const sheet = await requireTabHeaders("Trusted Devices", TRUSTED_DEVICE_HEADERS);
  const now = new Date().toISOString();
  const targets = sheet.records.filter(({ record }) =>
    String(record["Tournament ID"]) === String(context.tournamentId) &&
    String(record["Player ID"]) === String(playerIdValue) &&
    !record["Revoked At"] &&
    (!deviceIdValue || String(record["Device ID"]) === String(deviceIdValue))
  );
  for (const target of targets) await writeSheetFields("Trusted Devices", sheet.headers, target.rowNumber, { "Revoked At": now });
  await appendAdminAudit({ resource: "player-passport", recordId: `${context.tournamentId}:${playerIdValue}`, action: deviceIdValue ? "Device Revoked" : "All Devices Revoked", previous: { activeDevices: targets.length }, next: { revokedAt: now }, updatedBy: editorName(updatedByValue), summary: "Player Passport" });
  return { revoked: targets.length };
}

export async function disablePlayerPassportActivation(playerIdValue, updatedByValue) {
  const context = await passportTournamentContext();
  const sheet = await requireTabHeaders("Player Passport", PLAYER_PASSPORT_HEADERS);
  const current = sheet.records.find(({ record }) =>
    String(record["Tournament ID"]) === String(context.tournamentId) &&
    String(record["Player ID"]) === String(playerIdValue)
  );
  if (!current) throw new Error("Player Passport has not been generated.");
  const next = { ...current.record, "Activation Active": "FALSE", "Updated At": new Date().toISOString(), "Updated By": editorName(updatedByValue) };
  await writeSheetFields("Player Passport", sheet.headers, current.rowNumber, fieldScopedChanges("Player Passport", sheet.headers, current.record, next));
  await appendAdminAudit({ resource: "player-passport", recordId: `${context.tournamentId}:${playerIdValue}`, action: "Activation Disabled", previous: { active: current.record["Activation Active"] }, next: { active: false }, updatedBy: editorName(updatedByValue), summary: "Player Passport" });
  return { disabled: true };
}

export async function readLiveScoringMatch(matchIdValue) {
  requireIsolatedScoringSheet();
  const matchId = String(matchIdValue || "").trim();
  const sheets = await readSheets([
    "Live Matches",
    "Live Hole Scores",
    "Course Holes",
    "Players",
    "Courses",
    "Rounds",
    "Team Names",
  ]);
  const matches = sheets["Live Matches"];
  const holes = sheets["Live Hole Scores"];
  const courseHoles = sheets["Course Holes"];
  const players = sheets.Players;
  const courses = sheets.Courses;
  const rounds = sheets.Rounds;
  const teams = sheets["Team Names"];
  requireHeaders(holes, "Live Hole Scores", LIVE_HOLE_HEADERS);
  requireHeaders(matches, "Live Matches", LIVE_MATCH_CORE_SCORE_HEADERS);
  const match = findUniqueMatch(matches, matchId).record;
  const tee = String(match.Tee || match["Tee Played"] || "").trim();
  const courseId = String(match["Course ID"] || "").trim();
  const metadata = courseHoles.records.map(({ record }) => record)
    .filter((row) => String(row["Course ID"] || "").trim() === courseId)
    .filter((row) => !tee || !row.Tee || String(row.Tee).trim() === tee)
    .sort((a, b) => Number(a["Hole Number"]) - Number(b["Hole Number"]));
  const scores = holes.records.map(({ record }) => record)
    .filter((row) => String(row["Match ID"] || "").trim() === matchId)
    .sort((a, b) => Number(a["Hole Number"]) - Number(b["Hole Number"]));
  const year = String(match.Year || "").trim();
  const round = String(match.Round || "").trim();
  const playerNames = Object.fromEntries(players.records.map(({ record }) => [
    String(record["Player ID"] || "").trim(),
    String(record["Display Name"] || `${record.First || ""} ${record.Last || ""}`.trim() || record["Player ID"] || "").trim(),
  ]));
  const course = courses.records.map(({ record }) => record).find((record) =>
    String(record["Course ID"] || "").trim() === courseId
  ) || {};
  const roundRecord = rounds.records.map(({ record }) => record).find((record) =>
    String(record.Year || "").trim() === year &&
    String(record.Round || "").replace(/\D/g, "") === round.replace(/\D/g, "")
  ) || {};
  const teamRecords = teams.records.map(({ record }) => record).filter((record) =>
    String(record.Year || "").trim() === year
  );
  const teamRecord = (side) => teamRecords.find((item) =>
    String(item["Team Side"] || "").match(/\d+/)?.[0] === String(side)
  ) || {};
  const teamName = (side) => {
    const record = teamRecord(side);
    return String(record?.["Team Names"] || record?.["Team Name"] || `Team ${side}`);
  };
  const formatCode = String(match.Format || "").toUpperCase();
  const formatName = String(
    roundRecord["Format Name"] ||
    roundRecord["Round Format"] ||
    ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[formatCode] ||
    match.Format ||
    ""
  );
  const holeResults = scores.map((row) => ({
    holeNumber: Number(row["Hole Number"]),
    winner: row["Hole Winner"],
  }));
  const liveStatus = calculateLiveMatchStatus(holeResults, match.Format);
  const points = calculateMatchPoints(match.Format, holeResults);
  return {
    match: Object.fromEntries(Object.entries(match).filter(([key]) => !key.startsWith("Access "))),
    courseHoles: metadata,
    holeScores: scores,
    canConfirm: match["Match Status"] !== "Final" && (liveStatus.complete || points.team1Points !== null),
    display: {
      courseName: String(course["Course Name"] || course.Course || courseId),
      formatName,
      matchName: String(match["Match Name"] || `Match ${match.Match || matchId}`),
      teamNames: { 1: teamName(1), 2: teamName(2) },
      teams: {
        1: {
          name: teamName(1),
          logo: String(teamRecord(1)["Team Logo"] || teamRecord(1)["Logo Filename"] || ""),
        },
        2: {
          name: teamName(2),
          logo: String(teamRecord(2)["Team Logo"] || teamRecord(2)["Logo Filename"] || ""),
        },
      },
      course: {
        name: String(course["Course Name"] || course.Course || courseId),
        logo: String(course["Course Logo"] || course["Logo Filename"] || ""),
        tee: String(match.Tee || match["Tee Played"] || course["Tee Played"] || course.Tee || ""),
        yardage: String(course.Yardage || course["Total Yardage"] || ""),
        par: String(course.Par || ""),
        rating: String(course["Course Rating"] || course.Rating || ""),
        slope: String(course["Slope Rating"] || course.Slope || ""),
      },
      playerNames,
    },
  };
}

export async function saveLiveHoleScore(matchIdValue, input = {}, updatedByValue) {
  requireIsolatedScoringSheet();
  const matchId = String(matchIdValue || "").trim();
  const updatedBy = editorName(updatedByValue);
  const sheets = await readSheets(["Live Matches", "Live Hole Scores", "Course Holes"]);
  const matches = sheets["Live Matches"];
  const holes = sheets["Live Hole Scores"];
  const courseHoles = sheets["Course Holes"];
  requireHeaders(holes, "Live Hole Scores", LIVE_HOLE_HEADERS);
  requireHeaders(matches, "Live Matches", LIVE_MATCH_CORE_SCORE_HEADERS);
  const match = findUniqueMatch(matches, matchId).record;
  if (match["Match Status"] === "Final") throw new Error("Reopen the match before changing hole scores.");
  if (String(input.expectedUpdatedAt || "") !== String(match["Updated At"] || "")) {
    throw new Error("This match was updated by someone else. Refresh before saving again.");
  }
  const holeNumber = Number(input.holeNumber);
  const courseId = String(match["Course ID"] || "").trim();
  const tee = String(match.Tee || match["Tee Played"] || "").trim();
  const hole = courseHoles.records.map(({ record }) => record).find((row) =>
    String(row["Course ID"] || "").trim() === courseId &&
    Number(row["Hole Number"]) === holeNumber &&
    (!tee || !row.Tee || String(row.Tee).trim() === tee)
  );
  if (!hole) throw new Error(`Course metadata was not found for hole ${holeNumber}.`);
  const calculated = calculateLiveHole({
    format: match.Format,
    holeNumber,
    strokeIndex: hole["Stroke Index"],
    team1Players: scoringPlayers(match, 1),
    team2Players: scoringPlayers(match, 2),
    team1GrossScores: input.team1GrossScores,
    team2GrossScores: input.team2GrossScores,
    team1Strokes: match["Team 1 Stroke"],
    team2Strokes: match["Team 2 Stroke"],
  });
  const existing = holes.records.filter(({ record }) =>
    String(record["Match ID"] || "").trim() === matchId &&
    Number(record["Hole Number"]) === holeNumber
  );
  if (existing.length > 1) throw new Error(`Hole ${holeNumber} has duplicate score rows.`);
  const currentRevision = Number(existing[0]?.record.Revision || 0);
  if (Number(input.expectedRevision || 0) !== currentRevision) {
    throw new Error("This hole was updated by someone else. Refresh before saving again.");
  }
  const priorScores = holes.records.map(({ record }) => record)
    .filter((row) => String(row["Match ID"] || "").trim() === matchId)
    .map((row) => ({ holeNumber: Number(row["Hole Number"]), winner: row["Hole Winner"] }));
  const priorStatus = calculateLiveMatchStatus(priorScores, match.Format);
  if (priorStatus.complete && !existing.length) {
    throw new Error("This match is already complete. An administrator must reopen it before adding another hole.");
  }
  const updatedAt = new Date().toISOString();
  const next = {
    "Hole Score ID": `${matchId}-H${holeNumber}`,
    "Match ID": matchId,
    "Hole Number": holeNumber,
    "Stroke Index": calculated.strokeIndex,
    Format: calculated.format,
    "Team 1 Gross Scores": grossScoresForWorkbook(calculated.team1.grossScores.map((item) => item.grossScore)),
    "Team 2 Gross Scores": grossScoresForWorkbook(calculated.team2.grossScores.map((item) => item.grossScore)),
    "Team 1 Net Score": calculated.team1.netScore,
    "Team 2 Net Score": calculated.team2.netScore,
    "Hole Winner": calculated.winner,
    Revision: currentRevision + 1,
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  };
  if (existing.length) await writeSheetFields("Live Hole Scores", holes.headers, existing[0].rowNumber, next);
  else await appendSheetFields("Live Hole Scores", holes, next);
  const verifiedHoles = (await readSheets(["Live Hole Scores"]))["Live Hole Scores"];
  const verified = verifiedHoles.records.find(({ record }) => String(record["Match ID"] || "").trim() === matchId && Number(record["Hole Number"]) === holeNumber)?.record;
  const expectedTeam1 = calculated.team1.grossScores.map((item) => item.grossScore);
  const expectedTeam2 = calculated.team2.grossScores.map((item) => item.grossScore);
  if (!verified || JSON.stringify(grossScoresFromCell(verified["Team 1 Gross Scores"])) !== JSON.stringify(expectedTeam1) || JSON.stringify(grossScoresFromCell(verified["Team 2 Gross Scores"])) !== JSON.stringify(expectedTeam2) || Number(verified["Team 1 Net Score"]) !== calculated.team1.netScore || Number(verified["Team 2 Net Score"]) !== calculated.team2.netScore || verified["Hole Winner"] !== calculated.winner) {
    throw new Error(`Live Hole Scores read-back verification failed for ${matchId} hole ${holeNumber}.`);
  }
  await logMatchUpdate({ matchId, action: `Hole ${holeNumber} Updated`, previous: existing[0]?.record || {}, next, updatedBy, updatedAt });

  const allScores = holes.records.map(({ record }) => record)
    .filter((row) => String(row["Match ID"] || "").trim() === matchId && Number(row["Hole Number"]) !== holeNumber)
    .concat(next)
    .map((row) => ({ holeNumber: Number(row["Hole Number"]), winner: row["Hole Winner"] }));
  const liveStatus = calculateLiveMatchStatus(allScores, match.Format);
  const points = calculateMatchPoints(match.Format, allScores);
  const matchUpdates = existingLiveMatchProgressUpdates(matches.headers, {
    "Match Status": "Live",
    "Current Hole": liveStatus.currentHole,
    "Team 1 Holes Won": liveStatus.team1HolesWon,
    "Team 2 Holes Won": liveStatus.team2HolesWon,
    "Holes Remaining": liveStatus.holesRemaining,
    "Match Status Text": liveStatus.statusText,
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  });
  if (points.team1Points !== null) {
    matchUpdates["Front 9 Winner"] = points.frontWinner;
    matchUpdates["Back 9 Winner"] = points.backWinner;
    matchUpdates["18-Hole Winner"] = points.overallWinner;
    matchUpdates["Matchup Winner"] = points.overallWinner;
    matchUpdates["Team 1 Points"] = points.team1Points;
    matchUpdates["Team 2 Points"] = points.team2Points;
  }
  const liveMatchRow = findUniqueMatch(matches, matchId);
  await writeSheetFields("Live Matches", matches.headers, liveMatchRow.rowNumber, matchUpdates);
  const matchComplete = liveStatus.complete || points.team1Points !== null;
  return { hole: next, points, liveStatus, matchComplete, updatedAt, updatedBy };
}

export async function confirmLiveMatchScorecard(matchIdValue, updatedByValue) {
  requireIsolatedScoringSheet();
  const matchId = String(matchIdValue || "").trim();
  const sheets = await readSheets(["Live Matches", "Live Hole Scores"]);
  const matches = sheets["Live Matches"];
  const holes = sheets["Live Hole Scores"];
  requireHeaders(holes, "Live Hole Scores", LIVE_HOLE_HEADERS);
  const match = findUniqueMatch(matches, matchId).record;
  if (match["Match Status"] === "Final") throw new Error("This scorecard is already finalized.");
  const holeResults = holes.records.map(({ record }) => record)
    .filter((row) => String(row["Match ID"] || "").trim() === matchId)
    .map((row) => ({ holeNumber: Number(row["Hole Number"]), winner: row["Hole Winner"] }));
  const liveStatus = calculateLiveMatchStatus(holeResults, match.Format);
  const points = calculateMatchPoints(match.Format, holeResults);
  if (!liveStatus.complete && points.team1Points === null) {
    throw new Error("Complete the match before submitting the scorecard.");
  }
  return finalizeLiveMatch(matchId, {
    "Front 9 Winner": points.frontWinner,
    "Back 9 Winner": points.backWinner,
    "18-Hole Winner": points.overallWinner,
    "Matchup Winner": points.overallWinner,
    "Team 1 Points": points.team1Points,
    "Team 2 Points": points.team2Points,
    Notes: liveStatus.statusText,
  }, updatedByValue);
}

const LIVE_EDITABLE_FIELDS = [
  "Matchup Winner",
  "Front 9 Winner",
  "Back 9 Winner",
  "18-Hole Winner",
  "Team 1 Points",
  "Team 2 Points",
  "Match Status",
  "Notes",
];

const RESULT_FIELDS = [
  "Matchup Winner",
  "Front 9 Winner",
  "Back 9 Winner",
  "18-Hole Winner",
  "Team 1 Points",
  "Team 2 Points",
];

function findUniqueMatch(sheet, matchId) {
  const matches = sheet.records.filter(({ record }) => String(record["Match ID"] ?? "").trim() === matchId);
  if (!matches.length) throw new Error(`Match ${matchId} was not found.`);
  if (matches.length > 1) throw new Error(`Match ${matchId} appears more than once.`);
  return matches[0];
}

function cleanLiveValue(field, value) {
  const clean = String(value ?? "").replace(/\u0000/g, "").trim();
  if (clean.length > 4000) throw new Error(`${field} is too long.`);
  if (["Team 1 Points", "Team 2 Points"].includes(field)) {
    if (!clean) return "";
    const numeric = Number(clean);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 3) throw new Error(`${field} must be between 0 and 3.`);
    return String(numeric);
  }
  if (["Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner"].includes(field)) {
    if (!clean) return "";
    if (!["Team 1", "Team 2", "Halved"].includes(clean)) throw new Error(`${field} has an invalid winner.`);
  }
  if (field === "Match Status" && clean && !["Scheduled", "Live", "Final", "Reopened", "Ghost Match"].includes(clean)) {
    throw new Error("Match Status is invalid.");
  }
  return clean;
}

function editorName(value) {
  const name = String(value ?? "").replace(/\u0000/g, "").trim();
  if (!name) throw new Error("Updated By is required.");
  if (name.length > 100) throw new Error("Updated By is too long.");
  return name;
}

function logPayload(record) {
  return JSON.stringify(record, null, 0).slice(0, 45000);
}

async function logMatchUpdate({ matchId, action, previous, next, updatedBy, updatedAt }) {
  const required = ["Log ID", "Match ID", "Action", "Previous Value", "New Value", "Updated By", "Updated At"];
  const sheet = await requireTabHeaders("Match Update Log", required);
  await appendSheetFields("Match Update Log", sheet, {
    "Log ID": `LOG-${randomUUID()}`,
    "Match ID": matchId,
    Action: action,
    "Previous Value": logPayload(previous),
    "New Value": logPayload(next),
    "Updated By": updatedBy,
    "Updated At": updatedAt,
  });
}

export function validateLiveMatchFinalResult(record) {
  const teamOne = Number(record["Team 1 Points"]);
  const teamTwo = Number(record["Team 2 Points"]);
  if (!Number.isFinite(teamOne) || !Number.isFinite(teamTwo)) throw new Error("Both team point totals are required before finalizing.");
  if (Math.abs(teamOne + teamTwo - 3) > 0.000001) throw new Error("Final match points must total 3.");
  if (!record["18-Hole Winner"] && !record["Matchup Winner"]) throw new Error("An overall winner or Halved result is required before finalizing.");
}

export async function readLiveMatchAdminData() {
  const [live, players, teams, rosters] = await Promise.all([
    readSheet("Live Matches"),
    readSheet("Players"),
    readSheet("Team Names"),
    readSheet("Handicaps"),
  ]);
  requireHeaders(live, "Live Matches", ["Match ID", "Updated At", "Updated By", "Finalized At", "Finalized By"]);
  return {
    matches: live.records.map(({ record }) => record),
    players: players.records.map(({ record }) => ({ id: record["Player ID"], name: record["Display Name"] || record["Player ID"] })),
    teams: teams.records.map(({ record }) => record),
    rosters: rosters.records.map(({ record }) => ({
      year: record.Year,
      side: record["Team Side"],
      playerId: record["Player ID"],
    })),
  };
}

export async function readDirectorOperationsData(activeYear) {
  const sheets = await readSheets([
    "Live Matches", "Players", "Courses", "Calcutta Purchases", "Calcutta Ownership", "Net Skins",
  ]);
  const year = String(activeYear ?? "").trim();
  const yearScoped = new Set(["Live Matches", "Courses", "Calcutta Purchases", "Calcutta Ownership", "Net Skins"]);
  const records = (name) => sheets[name].records.map(({ record }) => record)
    .filter((record) => !year || !yearScoped.has(name) || String(record.Year ?? "").trim() === year);
  const players = records("Players").map((record) => ({
    id: String(record["Player ID"] || "").trim(),
    name: String(record["Display Name"] || record.Name || record["Player ID"] || "").trim(),
    slug: String(record.Slug || record["Player Slug"] || "").trim(),
  })).filter((player) => player.id);
  const names = new Map(players.map((player) => [player.id, player.name]));
  return {
    matches: records("Live Matches").map((record) => ({
      id: record["Match ID"], year: record.Year, round: record.Round, format: record.Format,
      match: record.Match, courseId: record["Course ID"], teeTime: record["Tee Time"],
      startingHole: record["Starting Hole"] || "", status: record["Match Status"],
      players: [1, 2].flatMap((side) => [1, 2].map((slot) => {
        const id = String(record[`Team ${side} Player ${slot}`] || "").trim();
        return { side, slot, id, name: names.get(id) || id };
      })).filter((player) => player.id),
    })),
    players,
    courses: records("Courses").map((record) => ({
      id: record["Course ID"], name: record.Course || record["Course Name"] || record["Course ID"],
    })).filter((course) => course.id),
    calcutta: {
      purchases: records("Calcutta Purchases").map((record) => ({
        golferPlayerId: record["Golfer Player ID"], golfer: names.get(String(record["Golfer Player ID"] || "")) || record["Golfer Player ID"],
        purchasePrice: Number(record["Purchase Price"] || 0),
      })),
      ownership: records("Calcutta Ownership").map((record) => ({
        golferPlayerId: record["Golfer Player ID"], ownerPlayerId: record["Owner Player ID"],
        owner: names.get(String(record["Owner Player ID"] || "")) || record["Owner Player ID"], ownershipPercentage: Number(String(record["Ownership %"] || "0").replace("%", "")),
      })).filter((record) => record.ownerPlayerId),
    },
    netSkins: records("Net Skins").map((record, index) => ({
      id: `${record.Year}-${record.Round}-${record["Player ID 1"]}-${record["Player ID 2"] || index}`,
      year: record.Year, round: record.Round, format: record.Format,
      playerIds: [record["Player ID 1"], record["Player ID 2"]].filter(Boolean),
      players: [record["Player ID 1"], record["Player ID 2"]].filter(Boolean).map((id) => names.get(String(id)) || id),
      eligible: /^(true|yes|y|1)$/i.test(String(record.Eligible || "")),
    })),
    capabilities: {
      startingHole: sheets["Live Matches"].headers.includes("Starting Hole") && writableFields("Live Matches").includes("Starting Hole"),
    },
  };
}

export async function updateDirectorMatchManagement(matchIdValue, updates, updatedByValue) {
  const matchId = String(matchIdValue || "").trim();
  const updatedBy = editorName(updatedByValue);
  const [liveSheet, playersSheet, rosterSheet] = await Promise.all([
    readSheet("Live Matches"), readSheet("Players"), readSheet("Handicaps"),
  ]);
  requireHeaders(liveSheet, "Live Matches", ["Match ID", "Updated At", "Updated By"]);
  const current = findUniqueMatch(liveSheet, matchId);
  if (String(current.record["Match Status"] || "").toLowerCase() === "final") throw new Error("Reopen the finalized match before editing it.");
  const allowed = ["Round", "Match", "Course ID", "Tee Time", "Starting Hole", ...LIVE_PAIRING_FIELDS]
    .filter((field) => liveSheet.headers.includes(field) && writableFields("Live Matches").includes(field));
  const submitted = Object.fromEntries(allowed.filter((field) => Object.hasOwn(updates || {}, field)).map((field) => [field, String(updates[field] ?? "").trim()]));
  if (LIVE_PAIRING_FIELDS.some((field) => Object.hasOwn(submitted, field))) {
    Object.assign(submitted, validateLiveMatchPairing({
      match: current.record,
      updates: { ...current.record, ...submitted },
      playerIds: playersSheet.records.map(({ record }) => record["Player ID"]),
      rosters: rosterSheet.records.map(({ record }) => record),
    }));
  }
  if (!Object.keys(submitted).length) throw new Error("No supported match fields were submitted.");
  const updatedAt = new Date().toISOString();
  const changes = { ...submitted, "Updated At": updatedAt, "Updated By": updatedBy };
  await writeSheetFields("Live Matches", liveSheet.headers, current.rowNumber, changes);
  await logMatchUpdate({ matchId, action: "Mission Control Updated", previous: current.record, next: { ...current.record, ...changes }, updatedBy, updatedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: "Mission Control Updated", previous: current.record, next: changes, updatedBy, summary: "Director match management" });
  return { ...current.record, ...changes };
}

export async function updateDirectorCalcutta(input, updatedByValue) {
  const updatedBy = editorName(updatedByValue);
  const year = String(input.year || "").trim();
  const golferPlayerId = String(input.golferPlayerId || "").trim();
  if (!year || !golferPlayerId) throw new Error("Year and golfer are required.");
  if (input.operation === "calcutta-session") {
    const [purchaseSheet, ownershipSheet] = await Promise.all([
      requireTabHeaders("Calcutta Purchases", ["Year", "Golfer Player ID", "Purchase Price"]),
      requireTabHeaders("Calcutta Ownership", ["Year", "Golfer Player ID", "Owner Player ID", "Ownership %"]),
    ]);
    const purchaseRows = purchaseSheet.records.filter(({ record }) => String(record.Year) === year && String(record["Golfer Player ID"]) === golferPlayerId);
    if (purchaseRows.length !== 1) throw new Error("The golfer must have exactly one Calcutta purchase row.");
    const purchasePrice = Number(input.purchasePrice);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error("Purchase Price must be zero or greater.");
    const owners = Array.isArray(input.owners) ? input.owners.map((owner) => ({ ownerPlayerId: String(owner?.ownerPlayerId || "").trim(), ownershipPercentage: Number(owner?.ownershipPercentage) })) : [];
    if (!owners.length || owners.some((owner) => !owner.ownerPlayerId)) throw new Error("Every owner is required.");
    if (owners.some((owner) => !Number.isFinite(owner.ownershipPercentage) || owner.ownershipPercentage <= 0 || owner.ownershipPercentage > 100)) throw new Error("Ownership percentages must be greater than 0% and no more than 100%.");
    if (new Set(owners.map((owner) => owner.ownerPlayerId)).size !== owners.length) throw new Error("Each owner may only appear once.");
    const total = owners.reduce((sum, owner) => sum + owner.ownershipPercentage, 0);
    if (Math.abs(total - 100) >= 0.000001) throw new Error(`Ownership percentages must total exactly 100%. Current total: ${total}%.`);
    await replaceScopedRuntimeRecordSets([
      { tab: "Calcutta Purchases", sheet: purchaseSheet, fields: ["Purchase Price"], records: [{ "Purchase Price": purchasePrice }], belongsToScope: (record) => String(record.Year) === year && String(record["Golfer Player ID"]) === golferPlayerId },
      { tab: "Calcutta Ownership", sheet: ownershipSheet, records: owners.map((owner) => ({ Year: year, "Golfer Player ID": golferPlayerId, "Owner Player ID": owner.ownerPlayerId, "Ownership %": owner.ownershipPercentage })), belongsToScope: (record) => String(record.Year) === year && String(record["Golfer Player ID"]) === golferPlayerId },
    ]);
  } else if (input.operation === "purchase") {
    const sheet = await requireTabHeaders("Calcutta Purchases", ["Year", "Golfer Player ID", "Purchase Price"]);
    const found = sheet.records.filter(({ record }) => String(record.Year) === year && String(record["Golfer Player ID"]) === golferPlayerId);
    if (found.length !== 1) throw new Error("The golfer must have exactly one Calcutta purchase row.");
    const purchasePrice = Number(input.purchasePrice);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error("Purchase Price must be zero or greater.");
    await writeSheetFields("Calcutta Purchases", sheet.headers, found[0].rowNumber, { "Purchase Price": purchasePrice });
  } else if (input.operation === "owner-group") {
    const sheet = await requireTabHeaders("Calcutta Ownership", ["Year", "Golfer Player ID", "Owner Player ID", "Ownership %"]);
    const owners = Array.isArray(input.owners) ? input.owners.map((owner) => ({
      ownerPlayerId: String(owner?.ownerPlayerId || "").trim(),
      ownershipPercentage: Number(owner?.ownershipPercentage),
    })) : [];
    if (!owners.length || owners.some((owner) => !owner.ownerPlayerId)) throw new Error("Every owner is required.");
    if (owners.some((owner) => !Number.isFinite(owner.ownershipPercentage) || owner.ownershipPercentage <= 0 || owner.ownershipPercentage > 100)) throw new Error("Ownership percentages must be greater than 0% and no more than 100%.");
    if (new Set(owners.map((owner) => owner.ownerPlayerId)).size !== owners.length) throw new Error("Each owner may only appear once.");
    const total = owners.reduce((sum, owner) => sum + owner.ownershipPercentage, 0);
    if (Math.abs(total - 100) >= 0.000001) throw new Error(`Ownership percentages must total exactly 100%. Current total: ${total}%.`);
    await replaceScopedRuntimeRecordSets([{
      tab: "Calcutta Ownership",
      sheet,
      records: owners.map((owner) => ({ Year: year, "Golfer Player ID": golferPlayerId, "Owner Player ID": owner.ownerPlayerId, "Ownership %": owner.ownershipPercentage })),
      belongsToScope: (record) => String(record.Year) === year && String(record["Golfer Player ID"]) === golferPlayerId,
    }]);
  } else {
    const sheet = await requireTabHeaders("Calcutta Ownership", ["Year", "Golfer Player ID", "Owner Player ID", "Ownership %"]);
    const ownerPlayerId = String(input.ownerPlayerId || "").trim();
    if (!ownerPlayerId) throw new Error("Owner is required.");
    const found = sheet.records.filter(({ record }) => String(record.Year) === year && String(record["Golfer Player ID"]) === golferPlayerId && String(record["Owner Player ID"]) === ownerPlayerId);
    if (input.operation === "owner-remove") {
      if (found.length !== 1) throw new Error("The ownership row was not found.");
      await writeSheetFields("Calcutta Ownership", sheet.headers, found[0].rowNumber, { "Owner Player ID": "", "Ownership %": "" });
    } else {
      const percentage = Number(input.ownershipPercentage);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new Error("Ownership must be greater than 0% and no more than 100%.");
      if (found.length > 1) throw new Error("The ownership row is duplicated.");
      if (found.length) await writeSheetFields("Calcutta Ownership", sheet.headers, found[0].rowNumber, { "Ownership %": percentage });
      else await appendSheetFields("Calcutta Ownership", sheet, { Year: year, "Golfer Player ID": golferPlayerId, "Owner Player ID": ownerPlayerId, "Ownership %": percentage });
    }
  }
  await synchronizeCalcuttaAfterOfficialUpdate({ Year: year });
  await appendAdminAudit({ resource: "calcutta", recordId: golferPlayerId, action: input.operation, previous: {}, next: input, updatedBy, summary: "Director Calcutta management" });
  return true;
}

export async function updateDirectorNetSkins(input, updatedByValue) {
  const updatedBy = editorName(updatedByValue);
  const year = String(input.year || "").trim();
  const playerId = String(input.playerId || "").trim();
  const updates = Array.isArray(input.updates) ? input.updates.map((item) => ({ round: Number(item?.round), eligible: Boolean(item?.eligible) })) : [{ round: Number(input.round), eligible: Boolean(input.eligible) }];
  if (!updates.length || updates.some((item) => !Number.isFinite(item.round) || item.round < 1)) throw new Error("Every eligibility update requires a configured tournament round.");
  if (new Set(updates.map((item) => item.round)).size !== updates.length) throw new Error("Each tournament round may only be updated once.");
  const sheet = await requireTabHeaders("Net Skins", ["Year", "Round", "Player ID 1", "Player ID 2", "Eligible"]);
  const byRound = new Map(updates.map((item) => [item.round, item.eligible]));
  const found = sheet.records.filter(({ record }) => String(record.Year) === year && byRound.has(Number(record.Round)) && [record["Player ID 1"], record["Player ID 2"]].some((id) => String(id) === playerId));
  for (const { round } of updates) if (!found.some(({ record }) => Number(record.Round) === round)) throw new Error(`No Net Skins entry exists for this player in Round ${round}.`);
  await replaceScopedRuntimeRecordSets([{ tab: "Net Skins", sheet, fields: ["Eligible"], records: found.map(({ record }) => ({ Eligible: byRound.get(Number(record.Round)) ? "TRUE" : "FALSE" })), belongsToScope: (record) => String(record.Year) === year && byRound.has(Number(record.Round)) && [record["Player ID 1"], record["Player ID 2"]].some((id) => String(id) === playerId) }]);
  await appendAdminAudit({ resource: "net-skins", recordId: playerId, action: "Bulk Eligibility Updated", previous: {}, next: { year, playerId, updates }, updatedBy, summary: "Director Net Skins eligibility" });
  return true;
}

export async function updateLiveMatchPairing(matchIdValue, updates, updatedByValue) {
  const matchId = String(matchIdValue ?? "").trim();
  if (!matchId) throw new Error("Match ID is required.");
  const updatedBy = editorName(updatedByValue);
  const [liveSheet, playersSheet, rosterSheet] = await Promise.all([
    readSheet("Live Matches"),
    readSheet("Players"),
    readSheet("Handicaps"),
  ]);
  requireHeaders(liveSheet, "Live Matches", ["Match ID", ...LIVE_PAIRING_FIELDS, "Updated At", "Updated By"]);
  const current = findUniqueMatch(liveSheet, matchId);
  const pairing = validateLiveMatchPairing({
    match: current.record,
    updates,
    playerIds: playersSheet.records.map(({ record }) => record["Player ID"]),
    rosters: rosterSheet.records.map(({ record }) => record),
  });
  const updatedAt = new Date().toISOString();
  const next = {
    ...current.record,
    ...pairing,
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  };
  await writeSheetFields("Live Matches", liveSheet.headers, current.rowNumber, {
    ...pairing,
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  });
  await logMatchUpdate({
    matchId,
    action: "Pairing Updated",
    previous: Object.fromEntries(LIVE_PAIRING_FIELDS.map((field) => [field, current.record[field] || ""])),
    next: pairing,
    updatedBy,
    updatedAt,
  });
  await appendAdminAudit({
    resource: "live-scoring",
    recordId: matchId,
    action: "Pairing Updated",
    previous: current.record,
    next,
    updatedBy,
    summary: "Live match pairing",
  });
  return next;
}

export async function updateLiveMatch(matchIdValue, updates, updatedByValue) {
  const matchId = String(matchIdValue ?? "").trim();
  if (!matchId) throw new Error("Match ID is required.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await readSheet("Live Matches");
  requireHeaders(sheet, "Live Matches", ["Match ID", "Updated At", "Updated By", "Finalized At", "Finalized By"]);
  const current = findUniqueMatch(sheet, matchId);
  const next = { ...current.record };
  for (const field of LIVE_EDITABLE_FIELDS) if (Object.hasOwn(updates || {}, field)) next[field] = cleanLiveValue(field, updates[field]);
  const updatedAt = new Date().toISOString();
  next["Updated At"] = updatedAt;
  next["Updated By"] = updatedBy;
  await writeSheetFields("Live Matches", sheet.headers, current.rowNumber, {
    ...Object.fromEntries(LIVE_EDITABLE_FIELDS.filter((field) => Object.hasOwn(updates || {}, field)).map((field) => [field, next[field]])),
    "Updated At": updatedAt,
    "Updated By": updatedBy,
  });
  await logMatchUpdate({ matchId, action: "Updated", previous: current.record, next, updatedBy, updatedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: "Updated", previous: current.record, next, updatedBy, summary: "Live match" });
  return next;
}

export async function finalizeLiveMatch(matchIdValue, updates, updatedByValue, options = {}) {
  const matchId = String(matchIdValue ?? "").trim();
  if (!matchId) throw new Error("Match ID is required.");
  const updatedBy = editorName(updatedByValue);
  const sourceSheets = await readSheets(["Live Matches", "Players", "Courses", "Team Names", "Live Hole Scores"]);
  const liveSheet = sourceSheets["Live Matches"];
  requireHeaders(liveSheet, "Live Matches", ["Match ID", "Updated At", "Updated By", "Finalized At", "Finalized By"]);
  const live = findUniqueMatch(liveSheet, matchId);
  const finalizedAt = new Date().toISOString();
  const nextLive = { ...live.record };
  for (const field of LIVE_EDITABLE_FIELDS) if (Object.hasOwn(updates || {}, field)) nextLive[field] = cleanLiveValue(field, updates[field]);
  nextLive["Match Status"] = "Final";
  nextLive["Updated At"] = finalizedAt;
  nextLive["Updated By"] = updatedBy;
  nextLive["Finalized At"] = finalizedAt;
  nextLive["Finalized By"] = updatedBy;
  validateLiveMatchFinalResult(nextLive);

  const matchesSheet = await requireTabHeaders("Matches", FINALIZED_MATCH_ARCHIVE_HEADERS);
  requireHeaders(matchesSheet, "Matches", FINALIZED_MATCH_ARCHIVE_HEADERS);
  const existing = matchesSheet.records.filter(({ record }) => String(record["Match ID"] ?? "").trim() === matchId);
  if (existing.length > 1) throw new Error(`Permanent match ${matchId} appears more than once.`);
  const previousPermanent = existing[0]?.record || {};
  const teamNames = Object.fromEntries([1, 2].map((side) => {
    const row = sourceSheets["Team Names"].records.map(({ record }) => record).find((record) =>
      String(record.Year) === String(nextLive.Year) &&
      String(record["Team Side"] || "").match(/\d+/)?.[0] === String(side)
    );
    return [side, row?.["Team Names"] || row?.["Team Name"] || `Team ${side}`];
  }));
  const matchHoles = sourceSheets["Live Hole Scores"].records.map(({ record }) => record)
    .filter((record) => String(record["Match ID"] || "").trim() === matchId);
  const permanent = buildFinalizedMatchArchiveSnapshot({
    live: nextLive,
    previous: previousPermanent,
    players: sourceSheets.Players.records.map(({ record }) => record),
    courses: sourceSheets.Courses.records.map(({ record }) => record),
    finalResult: finalizedMatchResult(nextLive, matchHoles, teamNames),
    finalizedAt,
    finalizedBy: updatedBy,
  });
  if (existing.length) await writeSheetFields(
    "Matches",
    matchesSheet.headers,
    existing[0].rowNumber,
    Object.fromEntries(writableFields("Matches")
      .filter((field) => matchesSheet.headers.includes(field) && Object.hasOwn(permanent, field))
      .map((field) => [field, permanent[field] ?? ""]))
  );
  else throw new Error(`Matches requires a workbook-generated Match ID row for ${matchId}. Protected formulas were not modified.`);
  await writeSheetFields("Live Matches", liveSheet.headers, live.rowNumber, {
    ...Object.fromEntries(LIVE_EDITABLE_FIELDS.map((field) => [field, nextLive[field] ?? ""])),
    "Match Status": "Final",
    "Updated At": finalizedAt,
    "Updated By": updatedBy,
    "Finalized At": finalizedAt,
    "Finalized By": updatedBy,
  });
  await logMatchUpdate({ matchId, action: existing.length ? "Re-finalized" : "Finalized", previous: { live: live.record, permanent: previousPermanent }, next: { live: nextLive, permanent }, updatedBy, updatedAt: finalizedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: existing.length ? "Re-finalized" : "Finalized", previous: { live: live.record, permanent: previousPermanent }, next: { live: nextLive, permanent }, updatedBy, summary: "Live match" });
  const { getTournamentData, invalidateTournamentDataCache } = await import("../app/live/sheetData.js");
  invalidateTournamentDataCache(["Live Matches", "Matches", "Match Update Log", "Admin Audit Log"]);
  const tournamentModel = await getTournamentData();
  await synchronizeNetSkinsAfterMatch(nextLive, { tournamentModel });
  const calcuttaPublication = await synchronizeCalcuttaAfterOfficialUpdate(nextLive, { tournamentModel });
  return options.includeCalcuttaPublicationTrace
    ? { ...nextLive, __calcuttaPublication: calcuttaPublication }
    : nextLive;
}

export async function reopenLiveMatch(matchIdValue, updatedByValue) {
  const matchId = String(matchIdValue ?? "").trim();
  if (!matchId) throw new Error("Match ID is required.");
  const updatedBy = editorName(updatedByValue);
  const updatedAt = new Date().toISOString();
  const liveSheet = await readSheet("Live Matches");
  requireHeaders(liveSheet, "Live Matches", ["Match ID", "Updated At", "Updated By", "Finalized At", "Finalized By"]);
  const live = findUniqueMatch(liveSheet, matchId);
  if (live.record["Match Status"] !== "Final") throw new Error("Only a finalized match can be reopened.");
  const nextLive = { ...live.record, "Match Status": "Reopened", "Updated At": updatedAt, "Updated By": updatedBy, "Finalized At": "", "Finalized By": "" };

  const matchesSheet = await requireTabHeaders("Matches", ["Match ID", "Completed At", "Finalized At", "Finalized By"]);
  requireHeaders(matchesSheet, "Matches", ["Match ID", "Completed At", "Finalized At", "Finalized By"]);
  const permanent = findUniqueMatch(matchesSheet, matchId);
  const nextPermanent = { ...permanent.record, "Match Status": "Reopened", "Completed At": "", "Finalized At": "", "Finalized By": "" };
  for (const field of RESULT_FIELDS) nextPermanent[field] = "";
  await writeSheetFields("Matches", matchesSheet.headers, permanent.rowNumber, {
    ...Object.fromEntries(RESULT_FIELDS.map((field) => [field, ""])),
    "Match Status": "Reopened",
    "Completed At": "",
    "Finalized At": "",
    "Finalized By": "",
  });
  await writeSheetFields("Live Matches", liveSheet.headers, live.rowNumber, {
    "Match Status": "Reopened",
    "Updated At": updatedAt,
    "Updated By": updatedBy,
    "Finalized At": "",
    "Finalized By": "",
  });
  await logMatchUpdate({ matchId, action: "Reopened", previous: { live: live.record, permanent: permanent.record }, next: { live: nextLive, permanent: nextPermanent }, updatedBy, updatedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: "Reopened", previous: { live: live.record, permanent: permanent.record }, next: { live: nextLive, permanent: nextPermanent }, updatedBy, summary: "Live match" });
  const { getTournamentData, invalidateTournamentDataCache } = await import("../app/live/sheetData.js");
  invalidateTournamentDataCache(["Live Matches", "Matches", "Match Update Log", "Admin Audit Log"]);
  const tournamentModel = await getTournamentData();
  await synchronizeNetSkinsAfterMatch(nextLive, { tournamentModel });
  await synchronizeCalcuttaAfterOfficialUpdate(nextLive, { tournamentModel });
  return nextLive;
}

const TOURNAMENT_EDITABLE_FIELDS = TOURNAMENT_CMS_FIELDS.map((field) => field.name);

function tournamentRecord(sheet, reference) {
  const validIds = sheet.records.map(({ record }) => tournamentId(record)).filter(Boolean);
  const value = assertValidTournamentId(reference, validIds);
  const matches = sheet.records.filter(({ record }) =>
    tournamentId(record) === value
  );
  if (!matches.length) throw new Error(`Tournament ${value || "record"} was not found.`);
  if (matches.length > 1) throw new Error(`Tournament ${value} appears more than once.`);
  return matches[0];
}

export async function readTournamentAdminData(reference) {
  const sheet = await requireTabHeaders("Tournaments", TOURNAMENT_EDITABLE_FIELDS);
  requireHeaders(sheet, "Tournaments", ["Year"]);
  const current = tournamentRecord(sheet, reference);
  const recoveredIdentifier = !isValidTournamentYear(current.record.Year) && Boolean(tournamentYear(current.record));
  return {
    record: { ...current.record, Year: tournamentYear(current.record) || "" },
    recoveredIdentifier,
    editableFields: TOURNAMENT_CMS_FIELDS.filter((field) => sheet.headers.includes(field.name)),
  };
}

export async function updateTournamentAdminData(reference, updates, updatedByValue) {
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders("Tournaments", TOURNAMENT_EDITABLE_FIELDS);
  requireHeaders(sheet, "Tournaments", ["Year"]);
  const current = tournamentRecord(sheet, reference);
  const next = { ...current.record };
  let changed = 0;
  for (const field of TOURNAMENT_CMS_FIELDS) {
    if (field.type === "readonly" || !sheet.headers.includes(field.name) || !Object.hasOwn(updates || {}, field.name)) continue;
    next[field.name] = cleanCmsValue(field, updates[field.name]);
    changed += 1;
  }
  if (!isValidTournamentYear(next.Year)) throw new Error("A valid four-digit tournament year is required.");
  if (String(next["Tournament ID"] ?? "").trim() === "0") throw new Error("Tournament ID 0 is not allowed.");
  if (!changed) throw new Error("No supported tournament fields were submitted.");
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  await writeSheetFields("Tournaments", sheet.headers, current.rowNumber, fieldScopedChanges("Tournaments", sheet.headers, current.record, next));
  await appendAdminAudit({ resource: "tournament", recordId: String(next["Tournament ID"] || next.Year), action: "Edited", previous: current.record, next, updatedBy, summary: "Tournament" });
  await synchronizeCalcuttaAfterOfficialUpdate(next);
  return { record: next, updatedAt, updatedBy };
}

async function ensureTabs(schemas) {
  const book = await readWorkbookMetadata();
  const existing = new Set((book.sheets || []).map((sheet) => sheet.properties.title));
  const missing = Object.values(schemas).filter(({ tab }) => !existing.has(tab));
  if (missing.length) throw new Error(`Workbook schema is missing required sheets: ${missing.map(({ tab }) => tab).join(", ")}. Workbook structure was not modified.`);
  await Promise.all(Object.values(schemas).map(({ tab, headers }) => requireTabHeaders(tab, headers)));
}

function rowsAsObjects(values, schema) {
  const [sheetHeaders = [], ...rows] = values || [];
  const headers = sheetHeaders.length ? sheetHeaders : schema.headers;
  return rows.filter((row) => row.some((value) => String(value ?? "").trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

async function readGuideType(type) {
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema) throw new Error("Unknown Tournament Guide content type.");
  const data = await google(`/values/${encodeURIComponent(`${schema.tab}!A:Z`)}`);
  return rowsAsObjects(data.values, schema);
}

function safeGuideRecord(type, input, existingId) {
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema) throw new Error("Unknown Tournament Guide content type.");
  const record = {};
  for (const header of schema.headers) {
    const raw = header === schema.id ? (existingId || input[header] || `${type.slice(0, 3).toUpperCase()}-${randomUUID()}`) : input[header];
    const value = String(raw ?? "").replace(/\u0000/g, "").trim();
    if (value.length > 12000) throw new Error(`${header} is too long.`);
    record[header] = value;
  }
  if (!record["Tournament ID"]) throw new Error("Tournament ID is required.");
  assertValidTournamentId(record["Tournament ID"]);
  if (["rules", "itinerary", "information"].includes(type) && !record.Title) throw new Error("Title is required.");
  record.Status = ["Draft", "Published", "Archived", "Cancelled"].includes(record.Status) ? record.Status : "Draft";
  record["Display Order"] = String(Math.max(0, Number.parseInt(record["Display Order"], 10) || 0));
  record["Updated At"] = new Date().toISOString();
  for (const field of ["Important", "Featured", "Sensitive"]) if (field in record) record[field] = /^(true|yes|1)$/i.test(record[field]) ? "TRUE" : "FALSE";
  return record;
}

export async function readTournamentGuideAdminData() {
  await ensureTabs(GUIDE_TAB_SCHEMAS);
  const entries = await Promise.all(Object.keys(GUIDE_TAB_SCHEMAS).map(async (type) => [type, await readGuideType(type)]));
  return Object.fromEntries(entries);
}

export async function saveTournamentGuideRecord(type, input, updatedByValue = "Guide Admin") {
  await ensureTabs(GUIDE_TAB_SCHEMAS);
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema) throw new Error("Unknown Tournament Guide content type.");
  const sheet = await requireTabHeaders(schema.tab, schema.headers);
  const rows = sheet.records;
  const records = rows.map(({ record }) => record);
  const requestedId = String(input?.[schema.id] ?? "").trim();
  const index = requestedId ? records.findIndex((record) => record[schema.id] === requestedId) : -1;
  const formulaPlaceholder = index < 0 && schema.tab === "Guide Information"
    ? rows.find(({ record }) => record[schema.id] && !record["Tournament ID"])
    : null;
  if (index < 0 && schema.tab === "Guide Information" && !formulaPlaceholder) {
    throw new Error("Guide Information requires a workbook-generated Item ID row. Workbook formulas were not modified.");
  }
  const record = safeGuideRecord(type, input || {}, index >= 0 ? requestedId : formulaPlaceholder?.record?.[schema.id] || null);
  const previous = index >= 0 ? records[index] : {};
  const writableRecord = Object.fromEntries(Object.entries(record).filter(([field]) => field !== schema.id || writableFields(schema.tab).includes(field)));
  let rowNumber;
  if (index >= 0) {
    rowNumber = rows[index].rowNumber;
    await writeSheetFields(schema.tab, sheet.headers, rowNumber, writableRecord);
  } else if (formulaPlaceholder) {
    rowNumber = formulaPlaceholder.rowNumber;
    await writeSheetFields(schema.tab, sheet.headers, rowNumber, writableRecord);
  } else {
    rowNumber = await appendSheetFields(schema.tab, sheet, writableRecord);
  }
  const saved = (await readSheet(schema.tab)).records.find((item) => item.rowNumber === rowNumber)?.record || record;
  await appendAdminAudit({ resource: "guide", recordId: saved[schema.id], action: index >= 0 ? "Edited" : "Created", previous, next: saved, updatedBy: editorName(updatedByValue || "Guide Admin"), summary: `${type} content` });
  invalidateOddsSnapshotCache();
  return saved;
}

export async function deleteTournamentGuideRecord(type, id, updatedByValue = "Guide Admin") {
  await ensureTabs(GUIDE_TAB_SCHEMAS);
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema || !id) throw new Error("A valid content record is required.");
  const sheet = await requireTabHeaders(schema.tab, schema.headers);
  const row = sheet.records.find(({ record }) => record[schema.id] === id);
  if (!row) throw new Error("Tournament Guide record was not found.");
  const previous = row.record;
  const fields = writableFields(schema.tab).filter((field) => sheet.headers.includes(field));
  await clearSheetFields(schema.tab, sheet.headers, row.rowNumber, fields);
  await appendAdminAudit({ resource: "guide", recordId: id, action: "Deleted", previous, next: {}, updatedBy: editorName(updatedByValue || "Guide Admin"), summary: `${type} content` });
  return { id };
}

export async function publishOddsSnapshot(snapshot) {
  try {
    await ensureOddsTabs();
    const existing = (await readOddsSnapshots()).filter((row) => !(row.year === snapshot.year && row.phase === snapshot.phase));
    const all = [...existing, snapshot].sort((a, b) => a.year - b.year || a.phaseOrder - b.phaseOrder);
    const sheets = await readSheets(TABS);
    await replaceRuntimeRecordSets([
      { tab: "Odds Snapshots", sheet: sheets["Odds Snapshots"], records: all.map((row) => ({ Year: row.year, Phase: row.phase, "Published At": row.publishedAt, "Snapshot JSON": JSON.stringify(row) })) },
      { tab: "Odds Control", sheet: sheets["Odds Control"], records: [{ Year: snapshot.year, "Current Official Phase": snapshot.phase, "Updated At": snapshot.publishedAt }] },
      {
        tab: "Odds Team Results",
        sheet: sheets["Odds Team Results"],
        records: all.flatMap((snap) => snap.teams.map((row) => ({
          Year: snap.year, Phase: snap.phase, Team: row.name, "Win Probability": row.probability,
          "American Odds": row.americanOdds, "Expected Points": row.expectedPoints,
        }))),
      },
      {
        tab: "Odds Player Results",
        sheet: sheets["Odds Player Results"],
        records: all.flatMap((snap) => snap.players.map((row) => ({
          Year: snap.year, Phase: snap.phase, "Player ID": row.id, Player: row.name,
          "Top Player Probability": row.probability, "American Odds": row.americanOdds,
          "Expected Points": row.expectedPoints, "Expected Record": row.expectedRecord,
          "Average Finish": row.averageFinish,
        }))),
      },
    ]);
    oddsSnapshotCache = all;
    oddsSnapshotCachedAt = Date.now();
    return snapshot;
  } catch (error) {
    error.workbookOperation ||= "Replace official projection snapshot and reporting views";
    error.worksheet ||= TABS.join(", ");
    error.functionName ||= "publishOddsSnapshot";
    throw error;
  }
}

export async function verifyPublishedOddsSnapshot(snapshot) {
  const sheets = await readSheets(TABS);
  const year = String(snapshot.year);
  const phase = String(snapshot.phase);
  const findRows = (tab) => sheets[tab].records.map(({ record }) => record).filter((row) => String(row.Year) === year && String(row.Phase) === phase);
  const snapshots = findRows("Odds Snapshots");
  if (snapshots.length !== 1) {
    const error = new Error(`Expected one published snapshot; found ${snapshots.length}.`);
    error.worksheet = "Odds Snapshots"; error.workbookOperation = "Verify published snapshot"; error.functionName = "verifyPublishedOddsSnapshot";
    throw error;
  }
  const control = sheets["Odds Control"].records.map(({ record }) => record).find((row) => String(row.Year) === year);
  if (!control || String(control["Current Official Phase"]) !== phase) {
    const error = new Error(`Odds Control does not identify ${phase} as the current official phase.`);
    error.worksheet = "Odds Control"; error.workbookOperation = "Verify current official phase"; error.functionName = "verifyPublishedOddsSnapshot";
    throw error;
  }
  const teams = findRows("Odds Team Results");
  if (teams.length !== snapshot.teams.length) {
    const error = new Error(`Expected ${snapshot.teams.length} team projection rows; found ${teams.length}.`);
    error.worksheet = "Odds Team Results"; error.workbookOperation = "Verify team projection rows"; error.functionName = "verifyPublishedOddsSnapshot";
    throw error;
  }
  const players = findRows("Odds Player Results");
  if (players.length !== snapshot.players.length) {
    const error = new Error(`Expected ${snapshot.players.length} player projection rows; found ${players.length}.`);
    error.worksheet = "Odds Player Results"; error.workbookOperation = "Verify player projection rows"; error.functionName = "verifyPublishedOddsSnapshot";
    throw error;
  }
  return { snapshotRows: snapshots.length, teamRows: teams.length, playerRows: players.length, controlPhase: phase };
}

const AUDIT_HEADERS = [
  "Audit ID", "Resource", "Record ID", "Action", "Summary", "Previous Value",
  "New Value", "Updated By", "Updated At",
];

function recordKey(schema, record) {
  return schema.idFields.map((field) => String(record?.[field] ?? "").trim()).join("::");
}

function normalizeBoolean(value) {
  return /^(true|yes|y|1|active)$/i.test(String(value ?? "").trim()) ? "TRUE" : "FALSE";
}

function cleanCmsValue(field, value) {
  if (field.type === "boolean") return normalizeBoolean(value);
  const clean = String(value ?? "").replace(/\u0000/g, "").trim();
  const limit = field.type === "textarea" ? 12000 : 1000;
  if (clean.length > limit) throw new Error(`${field.label} is too long.`);
  if (field.type === "number" && clean && !Number.isFinite(Number(clean))) throw new Error(`${field.label} must be a number.`);
  if (field.type === "url" && clean) {
    try {
      const url = new URL(clean);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      throw new Error(`${field.label} must be a valid web address.`);
    }
  }
  if (field.options?.length && clean && !field.options.includes(clean)) throw new Error(`${field.label} has an invalid value.`);
  return clean;
}

function generatedId(resource) {
  const prefix = ({ players: "P", schedule: "EVT", courses: "COURSE", matches: "MATCH", media: "ASSET" })[resource] || resource.slice(0, 4).toUpperCase();
  return `${prefix}-${randomUUID()}`;
}

function findCmsRecord(sheet, schema, key) {
  const found = sheet.records.filter(({ record }) => recordKey(schema, record) === String(key ?? "").trim());
  if (!found.length) throw new Error(`${schema.singular} was not found.`);
  if (found.length > 1) throw new Error(`${schema.singular} identifier is duplicated.`);
  return found[0];
}

async function appendAdminAudit({ resource, recordId, action, previous = {}, next = {}, updatedBy, summary = "" }) {
  const sheet = await requireTabHeaders("Admin Audit Log", AUDIT_HEADERS);
  const updatedAt = new Date().toISOString();
  await appendSheetFields("Admin Audit Log", sheet, {
    "Audit ID": `AUD-${randomUUID()}`,
    Resource: resource,
    "Record ID": recordId,
    Action: action,
    Summary: summary,
    "Previous Value": logPayload(previous),
    "New Value": logPayload(next),
    "Updated By": updatedBy,
    "Updated At": updatedAt,
  });
  return updatedAt;
}

function filterCmsRows(records, schema, { tournament, year } = {}) {
  if (schema.filter === "year" && year) return records.filter(({ record }) => String(record.Year ?? "").trim() === String(year));
  if (schema.filter === "tournament") {
    const id = assertValidTournamentId(tournament);
    return records.filter(({ record }) => recordBelongsToTournament(record, id, year));
  }
  return records;
}

function publicCmsRecord(schema, record) {
  return { ...record, __key: recordKey(schema, record) };
}

async function cmsFieldsWithOptions(schema, filters) {
  const sources = new Set(schema.fields.map((field) => field.source).filter(Boolean));
  const options = {};
  if (sources.has("players")) {
    const players = await safeRead("Players");
    options.players = players.records.map(({ record }) => {
      const filename = String(record["Photo Filename"] || "").trim();
      return {
        value: record["Player ID"],
        label: record["Display Name"] || record["Player ID"],
        image: filename ? `/images/players/${filename.replace(/\.(png|jpe?g|webp|avif)$/i, "")}.webp` : "",
      };
    }).filter((item) => item.value).sort((a, b) => a.label.localeCompare(b.label));
  }
  if (sources.has("courses")) {
    const courses = await safeRead("Courses");
    options.courses = courses.records.map(({ record }) => record).filter((record) => !filters.year || String(record.Year ?? "") === String(filters.year)).map((record) => ({ value: record["Course ID"], label: `${record.Course || record["Course ID"]}${record["Tee Played"] ? ` — ${record["Tee Played"]}` : ""}` })).filter((item) => item.value);
  }
  if (sources.has("teams")) {
    const teams = await safeRead("Team Names");
    options.teams = teams.records
      .map(({ record }) => record)
      .filter((record) => !filters.year || String(record.Year ?? "") === String(filters.year))
      .map((record) => ({
        value: record["Team ID"],
        label: `${record["Team Names"] || record["Team Name"] || record["Team ID"]}${record["Team Side"] ? ` — ${record["Team Side"]}` : ""}`,
      }))
      .filter((item) => item.value);
  }
  return schema.fields.map((field) => field.source ? { ...field, options: options[field.source] || [] } : field);
}

function firstValue(record, ...fields) {
  for (const field of fields) {
    const value = String(record?.[field] ?? "").trim();
    if (value) return value;
  }
  return "";
}

async function validateDraftRecord(resource, next, existing) {
  if (resource !== "draft-settings" && resource !== "draft-picks") return;
  const year = Number(next.Year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new Error("Draft year must be a valid four-digit year.");
  }

  const [playersSheet, teamsSheet] = await Promise.all([
    safeRead("Players"),
    safeRead("Team Names"),
  ]);
  const playerIds = new Set(playersSheet.records.map(({ record }) => String(record["Player ID"] || "").trim()).filter(Boolean));
  const teams = teamsSheet.records
    .map(({ record }) => record)
    .filter((record) => Number(record.Year) === year);
  const teamIds = new Set(teams.map((record) => String(record["Team ID"] || "").trim()).filter(Boolean));

  if (resource === "draft-settings") {
    const total = Number(firstValue(next, "Total Picks", "Total Draft Picks"));
    if (!Number.isInteger(total) || total < 1) throw new Error("Total picks must be a positive whole number.");
    const teamOne = firstValue(next, "Team 1 ID", "Team One ID");
    const teamTwo = firstValue(next, "Team 2 ID", "Team Two ID");
    for (const [label, value] of [["Team 1", teamOne], ["Team 2", teamTwo]]) {
      if (value && !teamIds.has(value)) throw new Error(`${label} ID does not exist for ${year}.`);
    }
    if (teamOne && teamTwo && teamOne === teamTwo) throw new Error("Team 1 and Team 2 must be different teams.");
    const captainOne = firstValue(next, "Team 1 Captain Player ID", "Team One Captain Player ID");
    const captainTwo = firstValue(next, "Team 2 Captain Player ID", "Team Two Captain Player ID");
    for (const [label, value] of [["Team 1 captain", captainOne], ["Team 2 captain", captainTwo]]) {
      if (value && !playerIds.has(value)) throw new Error(`${label} is not a valid Player ID.`);
    }
    if (captainOne && captainTwo && captainOne === captainTwo) throw new Error("Each team must have a different captain.");
    const firstPick = firstValue(next, "First Pick Team ID");
    if (firstPick && ![teamOne, teamTwo].includes(firstPick)) throw new Error("First pick team must be one of the two draft teams.");
    return;
  }

  const pickNumber = Number(next["Pick Number"]);
  if (!Number.isInteger(pickNumber) || pickNumber < 1) throw new Error("Pick number must be a positive whole number.");
  const settingsSheet = await safeRead("Draft Settings");
  const settings = settingsSheet.records.map(({ record }) => record).find((record) => Number(record.Year) === year);
  if (!settings) throw new Error(`Create Draft Settings for ${year} before adding picks.`);
  const total = Number(firstValue(settings, "Total Picks", "Total Draft Picks"));
  if (Number.isFinite(total) && total > 0 && pickNumber > total) throw new Error(`Pick number cannot exceed the ${total} configured picks.`);
  const teamId = firstValue(next, "Team ID");
  if (!teamIds.has(teamId)) throw new Error(`Team ID does not exist for ${year}.`);
  const playerId = firstValue(next, "Player ID");
  if (playerId && !playerIds.has(playerId)) throw new Error("Selected player is not a valid Player ID.");
  const captainIds = new Set([
    firstValue(settings, "Team 1 Captain Player ID", "Team One Captain Player ID"),
    firstValue(settings, "Team 2 Captain Player ID", "Team Two Captain Player ID"),
  ].filter(Boolean));
  if (playerId && captainIds.has(playerId)) throw new Error("Captains are already assigned and cannot also be drafted.");
  if (playerId) {
    const picksSheet = await safeRead("Draft Picks");
    const duplicatePlayer = picksSheet.records.some(({ record }) =>
      Number(record.Year) === year &&
      String(record["Player ID"] || "").trim() === playerId &&
      (!existing || !(Number(record["Pick Number"]) === Number(existing.record["Pick Number"]) && Number(record.Year) === Number(existing.record.Year)))
    );
    if (duplicatePlayer) throw new Error("That player has already been selected in this draft.");
  }
}

export async function readCmsResource(resource, filters = {}) {
  const schema = cmsResource(resource);
  if (!schema) throw new Error("Unknown Admin Center resource.");
  const requiredHeaders = schema.fields.map((field) => field.name);
  const sheet = await requireTabHeaders(schema.tab, requiredHeaders);
  const rows = filterCmsRows(sheet.records, schema, filters)
    .map(({ record }) => publicCmsRecord(schema, record))
    .sort((a, b) => {
      if (schema.orderField) return Number(a[schema.orderField] || 0) - Number(b[schema.orderField] || 0);
      return String(a[schema.summary?.[0]] || recordKey(schema, a)).localeCompare(String(b[schema.summary?.[0]] || recordKey(schema, b)), undefined, { numeric: true });
    });
  return {
    resource,
    label: schema.label,
    singular: schema.singular,
    fields: (await cmsFieldsWithOptions(schema, filters)).filter((field) => sheet.headers.includes(field.name)),
    summary: schema.summary,
    rows,
  };
}

async function saveExistingMatchCmsRecord(input, { key, year, updatedBy: updatedByValue } = {}) {
  const schema = cmsResource("matches");
  const updatedBy = editorName(updatedByValue);
  const sheets = await readSheets([schema.tab, "Admin Audit Log"]);
  const sheet = sheets[schema.tab];
  const auditSheet = sheets["Admin Audit Log"];
  validateSheetSchema(schema.tab, sheet.headers, schema.fields.map((field) => field.name));
  validateSheetSchema("Admin Audit Log", auditSheet.headers, AUDIT_HEADERS);
  const existing = findCmsRecord(sheet, schema, key);
  const next = { ...existing.record };
  for (const field of schema.fields) {
    if (field.type === "readonly" || field.type === "id") continue;
    if (Object.hasOwn(input || {}, field.name)) next[field.name] = cleanCmsValue(field, input[field.name]);
  }
  if (year && !next.Year) next.Year = String(year);
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  const allowed = new Set(writableFields(schema.tab));
  const updates = Object.fromEntries(Object.entries(next).filter(([field, value]) =>
    allowed.has(field) && String(existing.record[field] ?? "") !== String(value ?? "")
  ));
  if (!Object.keys(updates).length) return publicCmsRecord(schema, existing.record);

  validateFieldWrite(schema.tab, sheet.headers, updates);
  const auditRecord = {
    "Audit ID": `AUD-${randomUUID()}`,
    Resource: "matches",
    "Record ID": recordKey(schema, next),
    Action: "Edited",
    Summary: schema.singular,
    "Previous Value": logPayload(existing.record),
    "New Value": logPayload(next),
    "Updated By": updatedBy,
    "Updated At": updatedAt,
  };
  validateFieldWrite("Admin Audit Log", auditSheet.headers, auditRecord);
  const protectedBefore = await readProtectedFieldValues(schema.tab, sheet.headers, existing.rowNumber);
  const auditRow = Math.max(1, ...auditSheet.records.map((item) => item.rowNumber)) + 1;
  const ranges = [
    ...Object.entries(updates).map(([field, value]) => ({
      range: `${schema.tab}!${columnName(sheet.headers.indexOf(field))}${existing.rowNumber}`,
      values: [[normalizeWorkbookWriteValue(schema.tab, field, value)]],
    })),
    ...Object.entries(auditRecord).map(([field, value]) => ({
      range: `Admin Audit Log!${columnName(auditSheet.headers.indexOf(field))}${auditRow}`,
      values: [[normalizeWorkbookWriteValue("Admin Audit Log", field, value)]],
    })),
  ];
  metric("workbookWrites", 2);
  await google("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data: ranges }),
  });
  const protectedAfter = await readProtectedFieldValues(schema.tab, sheet.headers, existing.rowNumber);
  if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
    throw new Error(`${schema.tab} protected-column validation failed after writing row ${existing.rowNumber}.`);
  }
  return publicCmsRecord(schema, next);
}

export async function saveCmsRecord(resource, input, { key, tournament, year, updatedBy: updatedByValue } = {}) {
  if (resource === "matches" && key) {
    return saveExistingMatchCmsRecord(input, { key, year, updatedBy: updatedByValue });
  }
  const schema = cmsResource(resource);
  if (!schema) throw new Error("Unknown Admin Center resource.");
  if (schema.filter === "tournament") assertValidTournamentId(tournament);
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const existing = key ? findCmsRecord(sheet, schema, key) : null;
  const next = existing ? { ...existing.record } : {};

  for (const field of schema.fields) {
    if (field.type === "readonly") continue;
    // Stable IDs are immutable after creation. Public labels may change freely,
    // while every match, award, rating, captain, and roster join keeps pointing
    // at the same person or record.
    if (existing && field.type === "id") continue;
    if (Object.hasOwn(input || {}, field.name)) next[field.name] = cleanCmsValue(field, input[field.name]);
  }
  if (!existing && schema.filter === "year" && year && !next.Year) next.Year = String(year);
  if (!existing && schema.filter === "tournament" && tournament && !next["Tournament ID"]) next["Tournament ID"] = String(tournament);
  if (!existing && schema.orderField && !next[schema.orderField]) {
    next[schema.orderField] = String(filterCmsRows(sheet.records, schema, { tournament, year }).length + 1);
  }
  await validateDraftRecord(resource, next, existing);
  if (!existing && schema.idFields.length === 1 && !next[schema.idFields[0]]) next[schema.idFields[0]] = generatedId(resource);
  for (const idField of schema.idFields) if (!String(next[idField] ?? "").trim()) throw new Error(`${idField} is required.`);
  const nextKey = recordKey(schema, next);
  const duplicate = sheet.records.find(({ record }) => recordKey(schema, record) === nextKey && (!existing || recordKey(schema, record) !== recordKey(schema, existing.record)));
  if (duplicate) throw new Error(`${schema.singular} identifier already exists.`);
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  const allowed = new Set(writableFields(schema.tab));
  if (!existing && schema.idFields.some((field) => !allowed.has(field))) {
    throw new Error(`${schema.tab} requires a workbook-generated identifier. Protected columns were not modified.`);
  }
  const updates = Object.fromEntries(Object.entries(next).filter(([field, value]) =>
    allowed.has(field) && (!existing || String(existing.record[field] ?? "") !== String(value ?? ""))
  ));
  if (existing) await writeSheetFields(schema.tab, sheet.headers, existing.rowNumber, updates);
  else await appendSheetFields(schema.tab, sheet, updates);
  await appendAdminAudit({ resource, recordId: nextKey, action: existing ? "Edited" : "Created", previous: existing?.record || {}, next, updatedBy, summary: schema.singular });
  return publicCmsRecord(schema, next);
}

export async function archiveCmsRecord(resource, key, updatedByValue) {
  const schema = cmsResource(resource);
  if (!schema?.archiveField) throw new Error("This record type does not support archiving.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const existing = findCmsRecord(sheet, schema, key);
  const next = { ...existing.record };
  next[schema.archiveField] = schema.archiveField === "Active" ? "FALSE" : "Archived";
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  const updates = { [schema.archiveField]: next[schema.archiveField] };
  if (sheet.headers.includes("Updated At")) updates["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) updates["Updated By"] = updatedBy;
  await writeSheetFields(schema.tab, sheet.headers, existing.rowNumber, updates);
  await appendAdminAudit({ resource, recordId: key, action: "Archived", previous: existing.record, next, updatedBy, summary: schema.singular });
  return publicCmsRecord(schema, next);
}

export async function deleteCmsRecord(resource, key, updatedByValue) {
  const schema = cmsResource(resource);
  if (!schema) throw new Error("Unknown Admin Center resource.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const existing = findCmsRecord(sheet, schema, key);
  await clearSheetFields(schema.tab, sheet.headers, existing.rowNumber, writableFields(schema.tab).filter((field) => sheet.headers.includes(field)));
  await appendAdminAudit({ resource, recordId: key, action: "Deleted", previous: existing.record, next: {}, updatedBy, summary: schema.singular });
  return { key };
}

export async function reorderCmsRecord(resource, key, direction, filters, updatedByValue) {
  const schema = cmsResource(resource);
  if (!schema?.orderField) throw new Error("This record type does not support reordering.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await requireTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const ordered = filterCmsRows(sheet.records, schema, filters).sort((a, b) => Number(a.record[schema.orderField] || 0) - Number(b.record[schema.orderField] || 0));
  const index = ordered.findIndex(({ record }) => recordKey(schema, record) === key);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return readCmsResource(resource, filters);
  const current = ordered[index], target = ordered[targetIndex];
  const currentOrder = current.record[schema.orderField] || String(index + 1);
  const targetOrder = target.record[schema.orderField] || String(targetIndex + 1);
  await writeSheetFields(schema.tab, sheet.headers, current.rowNumber, { [schema.orderField]: targetOrder });
  await writeSheetFields(schema.tab, sheet.headers, target.rowNumber, { [schema.orderField]: currentOrder });
  await appendAdminAudit({ resource, recordId: key, action: "Reordered", previous: { order: currentOrder }, next: { order: targetOrder }, updatedBy, summary: schema.singular });
  return readCmsResource(resource, filters);
}

export async function readAdminAuditLog(limit = 200) {
  const sheet = await requireTabHeaders("Admin Audit Log", AUDIT_HEADERS);
  return sheet.records.map(({ record }) => record).reverse().slice(0, Math.max(1, Math.min(Number(limit) || 200, 500)));
}

function safeRead(tab) {
  return readSheet(tab).catch(() => ({ headers: [], records: [] }));
}

export async function readAdminDashboard({ tournament, year } = {}) {
  const selectedTournamentId = assertValidTournamentId(tournament);
  const [tournaments, players, teams, matches, live, courses, odds, audit] = await Promise.all([
    safeRead("Tournaments"), safeRead("Players"), safeRead("Team Names"), safeRead("Matches"),
    safeRead("Live Matches"), safeRead("Courses"), safeRead("Odds Snapshots"), safeRead("Admin Audit Log"),
  ]);
  const tournamentRow = tournaments.records.find(({ record }) => tournamentId(record) === selectedTournamentId)?.record || {};
  const selectedYear = tournamentYear(tournamentRow) || (isValidTournamentYear(year) ? Number(year) : null);
  const forTournament = (sheet) => sheet.records
    .map(({ record }) => record)
    .filter((record) => recordBelongsToTournament(record, selectedTournamentId, selectedYear));
  const yearMatches = forTournament(matches);
  const yearLive = forTournament(live);
  const yearTeams = forTournament(teams);
  const yearCourses = forTournament(courses);
  const liveById = new Map(yearLive.map((match) => [String(match["Match ID"] || ""), match]));
  const expectedByRound = new Map();
  for (const match of yearMatches) {
    const round = Number(match.Round);
    if (Number.isFinite(round)) expectedByRound.set(round, (expectedByRound.get(round) || 0) + 1);
  }
  const effectiveMatches = yearMatches.map((permanent) => {
    const liveMatch = liveById.get(String(permanent["Match ID"] || ""));
    const source = isFinalizedMatch(permanent) ? permanent : { ...permanent, ...(liveMatch || {}) };
    return {
      ...source,
      id: source["Match ID"],
      round: Number(source.Round),
      expectedRoundMatchCount: expectedByRound.get(Number(source.Round)) || 0,
    };
  });
  const finalMatches = effectiveMatches.filter(isOfficialMatchResult);
  const teamOnePoints = finalMatches.reduce((sum, match) => sum + (Number(match["Team 1 Points"]) || 0), 0);
  const teamTwoPoints = finalMatches.reduce((sum, match) => sum + (Number(match["Team 2 Points"]) || 0), 0);
  const effectiveState = getEffectiveTournamentState({
    matches: effectiveMatches,
    configuredStatus: tournamentRow["Tournament Status"] || tournamentRow.Status,
    configuredRound: tournamentRow["Current Round"],
    statusMode: tournamentRow["Status Mode"] || "Automatic",
  });
  const activePlayers = players.records.map(({ record }) => record).filter((player) => normalizeBoolean(player.Active) === "TRUE");
  const missingImages = activePlayers.filter((player) => !player["Photo Filename"]).length
    + yearTeams.filter((team) => !team["Team Logo"]).length
    + yearCourses.filter((course) => !course["Course Logo"] && !course["Course Profile Image"]).length;
  const lastOdds = odds.records.map(({ record }) => record)
    .filter((record) => recordBelongsToTournament(record, selectedTournamentId, selectedYear)).at(-1) || {};
  const lastActivity = audit.records.at(-1)?.record || {};
  const healthWarnings = [
    ...activePlayers.filter((player) => !player["Player ID"] || !player["Display Name"]).map(() => "Invalid player"),
    ...yearTeams.filter((team) => !team["Team ID"] || !team["Team Names"]).map(() => "Invalid team"),
    ...yearMatches.filter((match) => !match["Match ID"] || !match.Format).map(() => "Invalid match"),
  ].length;
  return {
    tournamentStatus: effectiveState.status,
    currentRound: effectiveState.currentRound,
    statusMode: tournamentRow["Status Mode"] || "Automatic",
    configuredStatus: tournamentRow["Tournament Status"] || tournamentRow.Status || "Upcoming",
    configuredRound: tournamentRow["Current Round"] || "1",
    overrideActive: effectiveState.overrideActive,
    liveMatches: effectiveState.liveMatchCount,
    matchesRemaining: effectiveState.remainingMatchCount,
    configuredMatches: yearMatches.length,
    teamScore: { teamOne: teamOnePoints, teamTwo: teamTwoPoints },
    lastPublishedOdds: lastOdds["Published At"] || "Not published",
    dataHealth: healthWarnings,
    missingImages,
    lastActivity,
  };
}

export async function readAdminStandings({ year } = {}) {
  const [matches, players, teams, ghostMatches] = await Promise.all([
    safeRead("Matches"), safeRead("Players"), safeRead("Team Names"), safeRead("Ghost Match"),
  ]);
  const exclusions = buildGhostMatchExclusionSet(ghostMatches.records.map(({ record }) => record));
  const playerMap = Object.fromEntries(players.records.map(({ record }) => [record["Player ID"], record["Display Name"] || record["Player ID"]]));
  const yearMatches = matches.records.map(({ record }) => record).filter((match) => String(match.Year ?? "") === String(year));
  const rows = yearMatches.filter((match) => ["Final", "Ghost Match"].includes(match["Match Status"]));
  const individual = new Map();
  const add = (id, points, outcome) => {
    if (!id) return;
    if (!individual.has(id)) individual.set(id, { id, name: playerMap[id] || id, points: 0, wins: 0, losses: 0, halves: 0, matches: 0 });
    const item = individual.get(id); item.points += points; item.matches += 1; item[outcome] += 1;
  };
  let teamOne = 0, teamTwo = 0;
  for (const match of rows) {
    const p1 = Number(match["Team 1 Points"]) || 0, p2 = Number(match["Team 2 Points"]) || 0;
    teamOne += p1; teamTwo += p2;
    const winner = String(match["Matchup Winner"] || "").toLowerCase();
    const outcome1 = winner.includes("halv") ? "halves" : winner === "team 1" ? "wins" : "losses";
    const outcome2 = winner.includes("halv") ? "halves" : winner === "team 2" ? "wins" : "losses";
    const sideOne = [match["Team 1 Player 1"], match["Team 1 Player 2"]].filter(Boolean);
    const sideTwo = [match["Team 2 Player 1"], match["Team 2 Player 2"]].filter(Boolean);
    sideOne
      .filter((id) => !isPlayerExcludedFromMatchRecord(match["Match ID"], id, exclusions))
      .forEach((id) => add(id, p1 / sideOne.length, outcome1));
    sideTwo
      .filter((id) => !isPlayerExcludedFromMatchRecord(match["Match ID"], id, exclusions))
      .forEach((id) => add(id, p2 / sideTwo.length, outcome2));
  }
  const teamRows = teams.records.map(({ record }) => record).filter((row) => String(row.Year ?? "") === String(year));
  const tournamentState = getTournamentState({
    tournament: { teamOne: { score: teamOne }, teamTwo: { score: teamTwo } },
    rounds: [...new Set(yearMatches.map((match) => Number(match.Round)).filter(Number.isFinite))].map((roundNumber) => ({
      number: roundNumber,
      matches: yearMatches.filter((match) => Number(match.Round) === roundNumber),
    })),
  });
  return {
    teams: [
      { side: "Team 1", name: teamRows.find((row) => row["Team Side"] === "Team 1")?.["Team Names"] || "Team 1", points: teamOne },
      { side: "Team 2", name: teamRows.find((row) => row["Team Side"] === "Team 2")?.["Team Names"] || "Team 2", points: teamTwo },
    ],
    players: [...individual.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    finalMatches: rows.length,
    tournamentState,
  };
}
