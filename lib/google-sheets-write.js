import { createSign, randomUUID } from "node:crypto";

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

  const matchesSheet = await readSheet("Matches");
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

  const matchesSheet = await readSheet("Matches");
  requireHeaders(matchesSheet, "Matches", ["Match ID", "Completed At", "Finalized At", "Finalized By"]);
  const permanent = findUniqueMatch(matchesSheet, matchId);
  const nextPermanent = { ...permanent.record, "Match Status": "Reopened", "Completed At": "", "Finalized At": "", "Finalized By": "" };
  for (const field of RESULT_FIELDS) nextPermanent[field] = "";
  await writeSheetRow("Matches", matchesSheet.headers, permanent.rowNumber, nextPermanent);
  await writeSheetRow("Live Matches", liveSheet.headers, live.rowNumber, nextLive);
  await logMatchUpdate({ matchId, action: "Reopened", previous: { live: live.record, permanent: permanent.record }, next: { live: nextLive, permanent: nextPermanent }, updatedBy, updatedAt });
  return nextLive;
}

const TOURNAMENT_EDITABLE_FIELDS = [
  "Annual", "Tournament Status", "Status", "Dates", "Location", "Destination",
  "Hero Image Filename", "Homepage Image", "Mobile Hero Image Filename", "Mobile Hero Image",
  "Annual Image", "Captain Team 1", "Captain Team 2", "Current Round", "Format Label",
];

function tournamentRecord(sheet, reference) {
  const value = String(reference ?? "").trim();
  const matches = sheet.records.filter(({ record }) =>
    String(record["Tournament ID"] ?? "").trim() === value || String(record.Year ?? "").trim() === value
  );
  if (!matches.length) throw new Error(`Tournament ${value || "record"} was not found.`);
  if (matches.length > 1) throw new Error(`Tournament ${value} appears more than once.`);
  return matches[0];
}

export async function readTournamentAdminData(reference) {
  const sheet = await readSheet("Tournaments");
  requireHeaders(sheet, "Tournaments", ["Year"]);
  const current = tournamentRecord(sheet, reference);
  return {
    record: current.record,
    editableFields: TOURNAMENT_EDITABLE_FIELDS.filter((field) => sheet.headers.includes(field)),
  };
}

export async function updateTournamentAdminData(reference, updates, updatedByValue) {
  const updatedBy = editorName(updatedByValue);
  const sheet = await readSheet("Tournaments");
  requireHeaders(sheet, "Tournaments", ["Year"]);
  const current = tournamentRecord(sheet, reference);
  const next = { ...current.record };
  let changed = 0;
  for (const field of TOURNAMENT_EDITABLE_FIELDS) {
    if (!sheet.headers.includes(field) || !Object.hasOwn(updates || {}, field)) continue;
    const value = String(updates[field] ?? "").replace(/\u0000/g, "").trim();
    if (value.length > 500) throw new Error(`${field} is too long.`);
    next[field] = value;
    changed += 1;
  }
  if (!changed) throw new Error("No supported tournament fields were submitted.");
  const updatedAt = new Date().toISOString();
  if (sheet.headers.includes("Updated At")) next["Updated At"] = updatedAt;
  if (sheet.headers.includes("Updated By")) next["Updated By"] = updatedBy;
  await writeSheetRow("Tournaments", sheet.headers, current.rowNumber, next);
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

export async function saveTournamentGuideRecord(type, input) {
  await ensureTabs(GUIDE_TAB_SCHEMAS);
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema) throw new Error("Unknown Tournament Guide content type.");
  const records = await readGuideType(type);
  const requestedId = String(input?.[schema.id] ?? "").trim();
  const index = requestedId ? records.findIndex((record) => record[schema.id] === requestedId) : -1;
  const record = safeGuideRecord(type, input || {}, index >= 0 ? requestedId : null);
  if (index >= 0) records[index] = record; else records.push(record);
  records.sort((a, b) => Number(a["Display Order"] || 0) - Number(b["Display Order"] || 0));
  await replaceTab(schema.tab, schema.headers, records.map((item) => schema.headers.map((header) => item[header] ?? "")));
  return record;
}

export async function deleteTournamentGuideRecord(type, id) {
  await ensureTabs(GUIDE_TAB_SCHEMAS);
  const schema = GUIDE_TAB_SCHEMAS[type];
  if (!schema || !id) throw new Error("A valid content record is required.");
  const records = await readGuideType(type);
  const remaining = records.filter((record) => record[schema.id] !== id);
  if (remaining.length === records.length) throw new Error("Tournament Guide record was not found.");
  await replaceTab(schema.tab, schema.headers, remaining.map((item) => schema.headers.map((header) => item[header] ?? "")));
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
