import { isTransientGoogleError } from "./google-api-reliability.js";

const clean = (value) => String(value ?? "").trim();

export class WorkbookInitializationError extends Error {
  constructor(check, cause) {
    super(`Tournament workbook initialization failed at ${check}.`);
    this.name = "WorkbookInitializationError";
    this.workbookCheck = check;
    this.publicMessage = `Tournament workbook check failed: ${check}.`;
    this.cause = cause;
    this.status = Number(cause?.status || cause?.cause?.status || 0);
    this.category = cause?.category || cause?.cause?.category || "unknown";
  }
}

function sheetState(values) {
  if (!Array.isArray(values) || values.length === 0) return "missing";
  const hasHeaders = (values[0] || []).some((value) => clean(value));
  const hasRecords = values.slice(1).some((row) => (row || []).some((value) => clean(value)));
  if (!hasHeaders) return "missing";
  return hasRecords ? "ready" : "empty";
}

export async function initializeTournamentWorkbook({
  requiredNames = [],
  optionalNames = [],
  readRequired,
  readSheet,
} = {}) {
  let required;
  let requiredError;
  const retryDelays = [250, 700];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      required = await readRequired(requiredNames);
      requiredError = undefined;
      break;
    } catch (error) {
      requiredError = error;
      if (!isTransientGoogleError(error) || attempt === retryDelays.length) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }

  if (requiredError) {
    // A transient snapshot failure says nothing about workbook schema. Do not
    // turn a slow or briefly unavailable range into a false "missing sheet"
    // diagnosis during a cold PWA/serverless start.
    if (isTransientGoogleError(requiredError)) {
      throw new WorkbookInitializationError("required normalized-sheet snapshot", requiredError);
    }
    if (readSheet) {
      for (const name of requiredNames) {
        try {
          await readSheet(name);
        } catch (sheetError) {
          if (isTransientGoogleError(sheetError)) {
            throw new WorkbookInitializationError("required normalized-sheet snapshot", sheetError);
          }
          throw new WorkbookInitializationError(`required sheet "${name}"`, sheetError);
        }
      }
    }
    throw new WorkbookInitializationError("required normalized-sheet snapshot", requiredError);
  }

  const optionalPairs = await Promise.all(optionalNames.map(async (name) => {
    try {
      return [name, await readSheet(name)];
    } catch {
      return [name, []];
    }
  }));
  const optional = Object.fromEntries(optionalPairs);
  const checks = {
    required: Object.fromEntries(requiredNames.map((name) => [name, sheetState(required?.[name])])),
    optional: Object.fromEntries(optionalNames.map((name) => [name, sheetState(optional[name])])),
  };
  return { sheets: { ...(required || {}), ...optional }, checks };
}

export function workbookInitializationMessage(error, fallback) {
  return error?.publicMessage || fallback;
}
