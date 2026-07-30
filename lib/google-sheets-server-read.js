import { createSign, randomUUID } from "node:crypto";
import { resolveSpreadsheetId } from "./spreadsheet-environment.js";
import { GoogleReadError, googleResponseError, withTransientGoogleRetry } from "./google-api-reliability.js";

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;
let pendingAccessToken;
const pendingReads = new Map();
const diagnostics = {
  apiRequests: 0,
  tokenRequests: 0,
  retries: 0,
  dedupeHits: 0,
  lastLatencyMs: 0,
  lastResult: "idle",
  lastErrorCategory: "",
};

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Authenticated Google Sheets reads are not configured.");
  return { email, privateKey };
}

async function accessToken() {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) return cachedAccessToken;
  if (pendingAccessToken) return pendingAccessToken;

  pendingAccessToken = withTransientGoogleRetry(async () => {
    const { email, privateKey } = credentials();
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
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth-2.0:jwt-bearer",
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
    cachedAccessToken = payload.access_token;
    cachedAccessTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
    return cachedAccessToken;
  }, { onRetry: () => { diagnostics.retries += 1; } }).finally(() => {
    pendingAccessToken = undefined;
  });
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
  const key = uniqueNames.join("\u0000");
  if (pendingReads.has(key)) {
    diagnostics.dedupeHits += 1;
    return pendingReads.get(key);
  }

  const startedAt = Date.now();
  const request = withTransientGoogleRetry(async () => {
    const token = await accessToken();
    const query = new URLSearchParams();
    uniqueNames.forEach((sheetName) => query.append("ranges", `${sheetName}!A:ZZ`));
    diagnostics.apiRequests += 1;
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
    return Object.fromEntries(uniqueNames.map((name, index) => [
      name,
      payload.valueRanges?.[index]?.values || [],
    ]));
  }, {
    onRetry: (_attempt, error) => {
      diagnostics.retries += 1;
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
  return request;
}

export function normalizedReadDiagnostics() {
  return {
    ...diagnostics,
    pendingReads: pendingReads.size,
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
