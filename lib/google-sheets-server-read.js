import { createSign, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolveSpreadsheetId } from "./spreadsheet-environment.js";
import { GoogleReadError, googleResponseError, withTransientGoogleRetry } from "./google-api-reliability.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import { currentGoogleServiceAccountCredentials } from "./google-service-account-credential-context.js";

const cachedAccessTokens = new Map();
const pendingAccessTokens = new Map();
const pendingReads = new Map();
const sheetValueCache = new Map();
const readRequestDiagnostics = new AsyncLocalStorage();
const LIVE_SHEETS = new Set(["Live Matches", "Live Hole Scores", "Live Tournaments", "Net Skins Result", "Round Results", "Tournament Results", "Calcutta Round Results", "Calcutta Standings", "Calcutta Owner Leaderboard"]);
const SEMI_STATIC_SHEETS = new Set(["Matches", "Net Skins", "Tournament Timeline", "Tournament Itinerary", "Guide Sections", "Live Round Handicaps", "Calcutta Purchases", "Calcutta Ownership", "Calcutta Point Structure", "Calcutta Payout"]);
const SHEET_TTLS = { live: 2_500, semiStatic: 60_000, static: 300_000 };
const diagnostics = {
  apiRequests: 0,
  tokenRequests: 0,
  retries: 0,
  dedupeHits: 0,
  sheetCacheHits: 0,
  sheetCacheMisses: 0,
  rangesRequested: 0,
  lastLatencyMs: 0,
  lastResult: "idle",
  lastErrorCategory: "",
};

function requestMetric(name, amount = 1) {
  const current = readRequestDiagnostics.getStore();
  if (current) current[name] = Number(current[name] || 0) + amount;
}

export async function withNormalizedReadDiagnostics(label, operation) {
  const existing = readRequestDiagnostics.getStore();
  if (existing) return { result: await operation(), diagnostics: existing };
  const current = {
    label, googleApiRequests: 0, batchRequests: 0, individualWorksheetRequests: 0,
    duplicateWorksheetReads: 0, cacheHits: 0, cacheMisses: 0, dedupeHits: 0,
    rangesRequested: 0, retries: 0, _requestedSheets: new Set(),
  };
  const startedAt = Date.now();
  const report = () => ({
    ...Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith("_"))),
    elapsedMs: Date.now() - startedAt,
  });
  try {
    return { result: await readRequestDiagnostics.run(current, operation), diagnostics: report() };
  } catch (error) {
    error.normalizedReadDiagnostics = report();
    throw error;
  }
}

export function normalizedSheetCategory(sheetName) {
  if (LIVE_SHEETS.has(sheetName)) return "live";
  if (SEMI_STATIC_SHEETS.has(sheetName)) return "semiStatic";
  return "static";
}

function cachedSheetValues(sheetName, now = Date.now()) {
  const cached = sheetValueCache.get(sheetName);
  const ttl = SHEET_TTLS[normalizedSheetCategory(sheetName)];
  return cached && now - cached.cachedAt < ttl ? cached.values : undefined;
}

export function invalidateNormalizedSheetCache(sheetNames) {
  if (!sheetNames?.length) {
    sheetValueCache.clear();
    return;
  }
  sheetNames.forEach((name) => sheetValueCache.delete(name));
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function credentials() {
  try {
    return currentGoogleServiceAccountCredentials();
  } catch (error) {
    if (error?.code === "LEGACY_GOOGLE_CREDENTIALS_MISSING") {
      throw new Error("Authenticated Google Sheets reads are not configured.");
    }
    throw error;
  }
}

async function accessToken() {
  const selectedCredentials = credentials();
  const cacheKey = selectedCredentials.cacheKey;
  const cached = cachedAccessTokens.get(cacheKey);
  if (cached?.token && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (pendingAccessTokens.has(cacheKey)) return pendingAccessTokens.get(cacheKey);

  const pendingAccessToken = withTransientGoogleRetry(async () => {
    const { email, privateKey } = selectedCredentials;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64url(JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      jti: randomUUID(),
    }));
    const unsigned = `${header}.${claim}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
    diagnostics.tokenRequests += 1;
    recordDataAuthorityTransport("google", { adapter: "google-sheets-server-read", transport: "oauth" });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const oauthError = String(payload.error || "unknown").replace(/[^a-z0-9_-]/gi, "");
      const description = String(payload.error_description || "").slice(0, 160);
      throw new GoogleReadError(`Google authentication failed (${response.status}: ${oauthError}${description ? ` — ${description}` : ""}).`, {
        status: response.status,
        category: response.status === 400 ? "authentication" : undefined,
      });
    }
    const token = payload.access_token;
    cachedAccessTokens.set(cacheKey, {
      token,
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    });
    return token;
  }, { onRetry: () => { diagnostics.retries += 1; } }).finally(() => {
    pendingAccessTokens.delete(cacheKey);
  });
  pendingAccessTokens.set(cacheKey, pendingAccessToken);
  return pendingAccessToken;
}

export function authenticatedPreviewReadsEnabled() {
  return process.env.VERCEL_ENV === "preview";
}

export async function readNormalizedSheetValues(sheetName) {
  const values = await readNormalizedSheetsValues([sheetName]);
  return values[sheetName] || [];
}

export async function readNormalizedSheetsValues(sheetNames) {
  const spreadsheetId = resolveSpreadsheetId();
  const uniqueNames = [...new Set(sheetNames)];
  const requestDiagnostics = readRequestDiagnostics.getStore();
  for (const name of uniqueNames) {
    if (requestDiagnostics?._requestedSheets.has(name)) requestMetric("duplicateWorksheetReads");
    requestDiagnostics?._requestedSheets.add(name);
  }
  const now = Date.now();
  const cached = Object.fromEntries(uniqueNames.flatMap((name) => {
    const values = cachedSheetValues(name, now);
    if (values === undefined) return [];
    diagnostics.sheetCacheHits += 1;
    requestMetric("cacheHits");
    return [[name, values]];
  }));
  const missingNames = uniqueNames.filter((name) => !Object.hasOwn(cached, name));
  diagnostics.sheetCacheMisses += missingNames.length;
  requestMetric("cacheMisses", missingNames.length);
  if (!missingNames.length) {
    diagnostics.lastResult = "cache-hit";
    diagnostics.lastLatencyMs = Date.now() - now;
    return cached;
  }
  const key = missingNames.join("\u0000");
  if (pendingReads.has(key)) {
    diagnostics.dedupeHits += 1;
    requestMetric("dedupeHits");
    return { ...cached, ...await pendingReads.get(key) };
  }

  const startedAt = Date.now();
  const request = withTransientGoogleRetry(async () => {
    const token = await accessToken();
    const query = new URLSearchParams();
    missingNames.forEach((sheetName) => query.append("ranges", `${sheetName}!A:ZZ`));
    diagnostics.rangesRequested += missingNames.length;
    diagnostics.apiRequests += 1;
    requestMetric("googleApiRequests");
    requestMetric("batchRequests");
    requestMetric("rangesRequested", missingNames.length);
    if (missingNames.length === 1) requestMetric("individualWorksheetRequests");
    recordDataAuthorityTransport("google", { adapter: "google-sheets-server-read", transport: "sheets" });
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) throw googleResponseError("Normalized workbook", response.status);
    const payload = await response.json();
    diagnostics.lastResult = "success";
    diagnostics.lastErrorCategory = "";
    const loaded = Object.fromEntries(missingNames.map((name, index) => [name, payload.valueRanges?.[index]?.values || []]));
    const cachedAt = Date.now();
    Object.entries(loaded).forEach(([name, values]) => sheetValueCache.set(name, { values, cachedAt }));
    return loaded;
  }, {
    onRetry: (_attempt, error) => {
      diagnostics.retries += 1;
      requestMetric("retries");
      diagnostics.lastErrorCategory = error?.category || "transient";
    },
  }).catch((error) => {
    diagnostics.lastResult = "error";
    diagnostics.lastErrorCategory = error?.category || "unknown";
    throw error instanceof Error ? error : new GoogleReadError("Normalized workbook read failed.");
  }).finally(() => {
    diagnostics.lastLatencyMs = Date.now() - startedAt;
    pendingReads.delete(key);
  });
  pendingReads.set(key, request);
  return { ...cached, ...await request };
}

export function normalizedReadDiagnostics() {
  return {
    ...diagnostics,
    pendingReads: pendingReads.size,
    cachedSheets: sheetValueCache.size,
    sheetCacheHitRate: diagnostics.sheetCacheHits + diagnostics.sheetCacheMisses
      ? diagnostics.sheetCacheHits / (diagnostics.sheetCacheHits + diagnostics.sheetCacheMisses)
      : 0,
    tokenCached: Boolean(cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000),
  };
}

export function safeWorkbookIdentifier() {
  try {
    const id = resolveSpreadsheetId();
    return id ? `…${id.slice(-6)}` : "not-configured";
  } catch {
    return "not-configured";
  }
}
