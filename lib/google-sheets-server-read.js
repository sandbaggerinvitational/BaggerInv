import { createSign } from "node:crypto";
import { resolveSpreadsheetId } from "./spreadsheet-environment.js";

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("Authenticated Google Sheets reads are not configured.");
  }
  return { email, privateKey };
}

async function accessToken() {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) {
    return cachedAccessToken;
  }

  const { email, privateKey } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google authentication failed (${response.status}).`);
  }
  const payload = await response.json();
  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

export function authenticatedPreviewReadsEnabled() {
  return process.env.VERCEL_ENV === "preview";
}

export async function readNormalizedSheetValues(sheetName) {
  const spreadsheetId = resolveSpreadsheetId();
  const token = await accessToken();
  const range = encodeURIComponent(`${sheetName}!A:ZZ`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(`${sheetName} returned Google Sheets API ${response.status}.`);
  }
  const payload = await response.json();
  return payload.values || [];
}
