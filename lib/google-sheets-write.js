import { createSign } from "node:crypto";

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
