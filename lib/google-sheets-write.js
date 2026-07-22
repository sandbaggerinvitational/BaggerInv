import { createSign, randomUUID } from "node:crypto";
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

const SHEET_ID = process.env.GOOGLE_SHEETS_ID || "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Google Sheets write credentials are not configured.");
  return { email, privateKey };
}

function base64url(value) { return Buffer.from(value).toString("base64url"); }

async function accessToken() {
  const { email, privateKey } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  return (await response.json()).access_token;
}

async function google(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`${API}${path}`, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}): ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const TABS = ["Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results"];

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
  const book = await google("");
  const existing = new Set((book.sheets || []).map((sheet) => sheet.properties.title));
  const missing = TABS.filter((title) => !existing.has(title));
  if (missing.length) await google(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) });
}

export async function readOddsSnapshots() {
  try {
    const data = await google(`/values/${encodeURIComponent("Odds Snapshots!A2:D")}`);
    return (data.values || []).map(([year, phase, publishedAt, payload]) => ({ year: Number(year), phase, publishedAt, ...JSON.parse(payload) }));
  } catch { return []; }
}

async function replaceTab(tab, headers, rows) {
  await google(`/values/${encodeURIComponent(`${tab}!A:Z`)}:clear`, { method: "POST", body: "{}" });
  await google(`/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers, ...rows] }) });
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

async function readSheet(tab) {
  const data = await google(`/values/${encodeURIComponent(`${tab}!A:ZZ`)}`);
  const [headers = [], ...values] = data.values || [];
  const records = values
    .map((row, index) => ({
      rowNumber: index + 2,
      record: Object.fromEntries(
        headers.flatMap((header, column) => header ? [[header, row[column] ?? ""]] : [])
      ),
    }))
    .filter(({ record }) => Object.values(record).some((value) => String(value ?? "").trim()));
  return { headers, records };
}

async function writeSheetRow(tab, headers, rowNumber, record) {
  if (!headers.length) throw new Error(`${tab} does not have a header row.`);
  const end = columnName(headers.length - 1);
  await google(`/values/${encodeURIComponent(`${tab}!A${rowNumber}:${end}${rowNumber}`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [headers.map((header) => header ? record[header] ?? "" : "")] }),
  });
}

async function appendSheetRow(tab, headers, record) {
  if (!headers.length) throw new Error(`${tab} does not have a header row.`);
  const end = columnName(headers.length - 1);
  await google(`/values/${encodeURIComponent(`${tab}!A:${end}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [headers.map((header) => header ? record[header] ?? "" : "")] }),
  });
}

async function clearSheetRow(tab, rowNumber, headerCount) {
  const end = columnName(Math.max(0, headerCount - 1));
  await google(`/values/${encodeURIComponent(`${tab}!A${rowNumber}:${end}${rowNumber}`)}:clear`, {
    method: "POST",
    body: "{}",
  });
}

async function ensureTabHeaders(tab, requiredHeaders) {
  const book = await google("");
  const existing = new Set((book.sheets || []).map((sheet) => sheet.properties.title));
  if (!existing.has(tab)) {
    await google(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
    });
    await google(`/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [requiredHeaders] }),
    });
    return readSheet(tab);
  }

  const sheet = await readSheet(tab);
  const missing = requiredHeaders.filter((header) => !sheet.headers.includes(header));
  if (missing.length) {
    const start = columnName(sheet.headers.length);
    const end = columnName(sheet.headers.length + missing.length - 1);
    await google(`/values/${encodeURIComponent(`${tab}!${start}1:${end}1`)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [missing] }),
    });
    return readSheet(tab);
  }
  return sheet;
}

function requireHeaders(sheet, tab, required) {
  for (const header of required) {
    if (!sheet.headers.includes(header)) throw new Error(`${tab} is missing the ${header} column.`);
  }
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
  if (field === "Match Status" && clean && !["Scheduled", "Live", "Final", "Reopened"].includes(clean)) {
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
  const sheet = await readSheet("Match Update Log");
  const required = ["Log ID", "Match ID", "Action", "Previous Value", "New Value", "Updated By", "Updated At"];
  requireHeaders(sheet, "Match Update Log", required);
  await appendSheetRow("Match Update Log", sheet.headers, {
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
  const [live, players, teams] = await Promise.all([
    readSheet("Live Matches"),
    readSheet("Players"),
    readSheet("Team Names"),
  ]);
  requireHeaders(live, "Live Matches", ["Match ID", "Updated At", "Updated By", "Finalized At", "Finalized By"]);
  return {
    matches: live.records.map(({ record }) => record),
    players: players.records.map(({ record }) => ({ id: record["Player ID"], name: record["Display Name"] || record["Player ID"] })),
    teams: teams.records.map(({ record }) => record),
  };
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
  await writeSheetRow("Live Matches", sheet.headers, current.rowNumber, next);
  await logMatchUpdate({ matchId, action: "Updated", previous: current.record, next, updatedBy, updatedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: "Updated", previous: current.record, next, updatedBy, summary: "Live match" });
  return next;
}

export async function finalizeLiveMatch(matchIdValue, updates, updatedByValue) {
  const matchId = String(matchIdValue ?? "").trim();
  if (!matchId) throw new Error("Match ID is required.");
  const updatedBy = editorName(updatedByValue);
  const liveSheet = await readSheet("Live Matches");
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

  const matchesSheet = await ensureTabHeaders("Matches", ["Match ID", "Course ID", "Tee Time", "Completed At", "Finalized At", "Finalized By"]);
  requireHeaders(matchesSheet, "Matches", ["Match ID", "Course ID", "Tee Time", "Completed At", "Finalized At", "Finalized By"]);
  const existing = matchesSheet.records.filter(({ record }) => String(record["Match ID"] ?? "").trim() === matchId);
  if (existing.length > 1) throw new Error(`Permanent match ${matchId} appears more than once.`);
  const previousPermanent = existing[0]?.record || {};
  const permanent = { ...previousPermanent };
  for (const header of matchesSheet.headers) if (Object.hasOwn(nextLive, header)) permanent[header] = nextLive[header];
  permanent["Match ID"] = matchId;
  permanent["Match Status"] = "Final";
  permanent["Completed At"] = previousPermanent["Completed At"] || finalizedAt;
  permanent["Finalized At"] = finalizedAt;
  permanent["Finalized By"] = updatedBy;
  if (existing.length) await writeSheetRow("Matches", matchesSheet.headers, existing[0].rowNumber, permanent);
  else await appendSheetRow("Matches", matchesSheet.headers, permanent);
  await writeSheetRow("Live Matches", liveSheet.headers, live.rowNumber, nextLive);
  await logMatchUpdate({ matchId, action: existing.length ? "Re-finalized" : "Finalized", previous: { live: live.record, permanent: previousPermanent }, next: { live: nextLive, permanent }, updatedBy, updatedAt: finalizedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: existing.length ? "Re-finalized" : "Finalized", previous: { live: live.record, permanent: previousPermanent }, next: { live: nextLive, permanent }, updatedBy, summary: "Live match" });
  return nextLive;
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

  const matchesSheet = await ensureTabHeaders("Matches", ["Match ID", "Completed At", "Finalized At", "Finalized By"]);
  requireHeaders(matchesSheet, "Matches", ["Match ID", "Completed At", "Finalized At", "Finalized By"]);
  const permanent = findUniqueMatch(matchesSheet, matchId);
  const nextPermanent = { ...permanent.record, "Match Status": "Reopened", "Completed At": "", "Finalized At": "", "Finalized By": "" };
  for (const field of RESULT_FIELDS) nextPermanent[field] = "";
  await writeSheetRow("Matches", matchesSheet.headers, permanent.rowNumber, nextPermanent);
  await writeSheetRow("Live Matches", liveSheet.headers, live.rowNumber, nextLive);
  await logMatchUpdate({ matchId, action: "Reopened", previous: { live: live.record, permanent: permanent.record }, next: { live: nextLive, permanent: nextPermanent }, updatedBy, updatedAt });
  await appendAdminAudit({ resource: "live-scoring", recordId: matchId, action: "Reopened", previous: { live: live.record, permanent: permanent.record }, next: { live: nextLive, permanent: nextPermanent }, updatedBy, summary: "Live match" });
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
  const sheet = await ensureTabHeaders("Tournaments", TOURNAMENT_EDITABLE_FIELDS);
  requireHeaders(sheet, "Tournaments", ["Year"]);
  const current = tournamentRecord(sheet, reference);
  return {
    record: { ...current.record, Year: tournamentYear(current.record) || "" },
    editableFields: TOURNAMENT_CMS_FIELDS.filter((field) => sheet.headers.includes(field.name)),
  };
}

export async function updateTournamentAdminData(reference, updates, updatedByValue) {
  const updatedBy = editorName(updatedByValue);
  const sheet = await ensureTabHeaders("Tournaments", TOURNAMENT_EDITABLE_FIELDS);
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
  await writeSheetRow("Tournaments", sheet.headers, current.rowNumber, next);
  await appendAdminAudit({ resource: "tournament", recordId: String(next["Tournament ID"] || next.Year), action: "Edited", previous: current.record, next, updatedBy, summary: "Tournament" });
  return { record: next, updatedAt, updatedBy };
}

async function ensureTabs(schemas) {
  const book = await google("");
  const existing = new Set((book.sheets || []).map((sheet) => sheet.properties.title));
  const missing = Object.values(schemas).filter(({ tab }) => !existing.has(tab));
  if (missing.length) {
    await google(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: missing.map(({ tab }) => ({ addSheet: { properties: { title: tab } } })) }) });
  }
  await Promise.all(missing.map(({ tab, headers }) => google(`/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) })));
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
  const records = await readGuideType(type);
  const requestedId = String(input?.[schema.id] ?? "").trim();
  const index = requestedId ? records.findIndex((record) => record[schema.id] === requestedId) : -1;
  const record = safeGuideRecord(type, input || {}, index >= 0 ? requestedId : null);
  const previous = index >= 0 ? records[index] : {};
  if (index >= 0) records[index] = record; else records.push(record);
  records.sort((a, b) => Number(a["Display Order"] || 0) - Number(b["Display Order"] || 0));
  await replaceTab(schema.tab, schema.headers, records.map((item) => schema.headers.map((header) => item[header] ?? "")));
  await appendAdminAudit({ resource: "guide", recordId: record[schema.id], action: index >= 0 ? "Edited" : "Created", previous, next: record, updatedBy: editorName(updatedByValue || "Guide Admin"), summary: `${type} content` });
  return record;
}

export async function deleteTournamentGuideRecord(type, id, updatedByValue = "Guide Admin") {
  await ensureTabs(GUIDE_TAB_SCHEMAS);
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema || !id) throw new Error("A valid content record is required.");
  const records = await readGuideType(type);
  const remaining = records.filter((record) => record[schema.id] !== id);
  if (remaining.length === records.length) throw new Error("Tournament Guide record was not found.");
  const previous = records.find((record) => record[schema.id] === id) || {};
  await replaceTab(schema.tab, schema.headers, remaining.map((item) => schema.headers.map((header) => item[header] ?? "")));
  await appendAdminAudit({ resource: "guide", recordId: id, action: "Deleted", previous, next: {}, updatedBy: editorName(updatedByValue || "Guide Admin"), summary: `${type} content` });
  return { id };
}

export async function publishOddsSnapshot(snapshot) {
  await ensureOddsTabs();
  const existing = (await readOddsSnapshots()).filter((row) => !(row.year === snapshot.year && row.phase === snapshot.phase));
  const all = [...existing, snapshot].sort((a, b) => a.year - b.year || a.phaseOrder - b.phaseOrder);
  await replaceTab("Odds Snapshots", ["Year", "Phase", "Published At", "Snapshot JSON"], all.map((row) => [row.year, row.phase, row.publishedAt, JSON.stringify(row)]));
  await replaceTab("Odds Control", ["Year", "Current Official Phase", "Updated At"], [[snapshot.year, snapshot.phase, snapshot.publishedAt]]);
  await replaceTab("Odds Team Results", ["Year", "Phase", "Team", "Win Probability", "American Odds", "Expected Points"], all.flatMap((snap) => snap.teams.map((row) => [snap.year, snap.phase, row.name, row.probability, row.americanOdds, row.expectedPoints])));
  await replaceTab("Odds Player Results", ["Year", "Phase", "Player ID", "Player", "Top Player Probability", "American Odds", "Expected Points", "Expected Record", "Average Finish"], all.flatMap((snap) => snap.players.map((row) => [snap.year, snap.phase, row.id, row.name, row.probability, row.americanOdds, row.expectedPoints, row.expectedRecord, row.averageFinish])));
  return snapshot;
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
  const sheet = await ensureTabHeaders("Admin Audit Log", AUDIT_HEADERS);
  const updatedAt = new Date().toISOString();
  await appendSheetRow("Admin Audit Log", sheet.headers, {
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
    options.players = players.records.map(({ record }) => ({ value: record["Player ID"], label: record["Display Name"] || record["Player ID"] })).filter((item) => item.value).sort((a, b) => a.label.localeCompare(b.label));
  }
  if (sources.has("courses")) {
    const courses = await safeRead("Courses");
    options.courses = courses.records.map(({ record }) => record).filter((record) => !filters.year || String(record.Year ?? "") === String(filters.year)).map((record) => ({ value: record["Course ID"], label: `${record.Course || record["Course ID"]}${record["Tee Played"] ? ` — ${record["Tee Played"]}` : ""}` })).filter((item) => item.value);
  }
  return schema.fields.map((field) => field.source ? { ...field, options: options[field.source] || [] } : field);
}

export async function readCmsResource(resource, filters = {}) {
  const schema = cmsResource(resource);
  if (!schema) throw new Error("Unknown Admin Center resource.");
  const requiredHeaders = schema.fields.map((field) => field.name);
  const sheet = await ensureTabHeaders(schema.tab, requiredHeaders);
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

export async function saveCmsRecord(resource, input, { key, tournament, year, updatedBy: updatedByValue } = {}) {
  const schema = cmsResource(resource);
  if (!schema) throw new Error("Unknown Admin Center resource.");
  if (schema.filter === "tournament") assertValidTournamentId(tournament);
  const updatedBy = editorName(updatedByValue);
  const sheet = await ensureTabHeaders(schema.tab, schema.fields.map((field) => field.name));
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
  if (!existing && schema.idFields.length === 1 && !next[schema.idFields[0]]) next[schema.idFields[0]] = generatedId(resource);
  for (const idField of schema.idFields) if (!String(next[idField] ?? "").trim()) throw new Error(`${idField} is required.`);
  const nextKey = recordKey(schema, next);
  const duplicate = sheet.records.find(({ record }) => recordKey(schema, record) === nextKey && (!existing || recordKey(schema, record) !== recordKey(schema, existing.record)));
  if (duplicate) throw new Error(`${schema.singular} identifier already exists.`);
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  if (existing) await writeSheetRow(schema.tab, sheet.headers, existing.rowNumber, next);
  else await appendSheetRow(schema.tab, sheet.headers, next);
  await appendAdminAudit({ resource, recordId: nextKey, action: existing ? "Edited" : "Created", previous: existing?.record || {}, next, updatedBy, summary: schema.singular });
  return publicCmsRecord(schema, next);
}

export async function archiveCmsRecord(resource, key, updatedByValue) {
  const schema = cmsResource(resource);
  if (!schema?.archiveField) throw new Error("This record type does not support archiving.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await ensureTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const existing = findCmsRecord(sheet, schema, key);
  const next = { ...existing.record };
  next[schema.archiveField] = schema.archiveField === "Active" ? "FALSE" : "Archived";
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  await writeSheetRow(schema.tab, sheet.headers, existing.rowNumber, next);
  await appendAdminAudit({ resource, recordId: key, action: "Archived", previous: existing.record, next, updatedBy, summary: schema.singular });
  return publicCmsRecord(schema, next);
}

export async function deleteCmsRecord(resource, key, updatedByValue) {
  const schema = cmsResource(resource);
  if (!schema) throw new Error("Unknown Admin Center resource.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await ensureTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const existing = findCmsRecord(sheet, schema, key);
  await clearSheetRow(schema.tab, existing.rowNumber, sheet.headers.length);
  await appendAdminAudit({ resource, recordId: key, action: "Deleted", previous: existing.record, next: {}, updatedBy, summary: schema.singular });
  return { key };
}

export async function reorderCmsRecord(resource, key, direction, filters, updatedByValue) {
  const schema = cmsResource(resource);
  if (!schema?.orderField) throw new Error("This record type does not support reordering.");
  const updatedBy = editorName(updatedByValue);
  const sheet = await ensureTabHeaders(schema.tab, schema.fields.map((field) => field.name));
  const ordered = filterCmsRows(sheet.records, schema, filters).sort((a, b) => Number(a.record[schema.orderField] || 0) - Number(b.record[schema.orderField] || 0));
  const index = ordered.findIndex(({ record }) => recordKey(schema, record) === key);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return readCmsResource(resource, filters);
  const current = ordered[index], target = ordered[targetIndex];
  const currentOrder = current.record[schema.orderField] || String(index + 1);
  const targetOrder = target.record[schema.orderField] || String(targetIndex + 1);
  await writeSheetRow(schema.tab, sheet.headers, current.rowNumber, { ...current.record, [schema.orderField]: targetOrder });
  await writeSheetRow(schema.tab, sheet.headers, target.rowNumber, { ...target.record, [schema.orderField]: currentOrder });
  await appendAdminAudit({ resource, recordId: key, action: "Reordered", previous: { order: currentOrder }, next: { order: targetOrder }, updatedBy, summary: schema.singular });
  return readCmsResource(resource, filters);
}

export async function readAdminAuditLog(limit = 200) {
  const sheet = await ensureTabHeaders("Admin Audit Log", AUDIT_HEADERS);
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
  const [matches, players, teams] = await Promise.all([safeRead("Matches"), safeRead("Players"), safeRead("Team Names")]);
  const playerMap = Object.fromEntries(players.records.map(({ record }) => [record["Player ID"], record["Display Name"] || record["Player ID"]]));
  const yearMatches = matches.records.map(({ record }) => record).filter((match) => String(match.Year ?? "") === String(year));
  const rows = yearMatches.filter((match) => match["Match Status"] === "Final");
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
    sideOne.forEach((id) => add(id, p1 / sideOne.length, outcome1)); sideTwo.forEach((id) => add(id, p2 / sideTwo.length, outcome2));
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
