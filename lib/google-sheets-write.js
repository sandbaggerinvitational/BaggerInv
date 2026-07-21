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
