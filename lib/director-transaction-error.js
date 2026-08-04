import { isTransientGoogleError } from "./google-api-reliability";

const TECHNICAL_FAILURE = /(?:google|sheets api|workbook request|rate.?limit|\b429\b|quota|fetch failed|econn|timeout)/i;

export function directorTransactionError(error, fallback = "Tournament update could not be completed. Please try again.", alwaysFallback = false) {
  if (alwaysFallback) return fallback;
  const message = String(error?.message || "").trim();
  if (!message || isTransientGoogleError(error) || TECHNICAL_FAILURE.test(message)) return fallback;
  return message;
}
