const clean = (value) => String(value ?? "").trim();

export class WorkbookInitializationError extends Error {
  constructor(check, cause) {
    super(`Tournament workbook initialization failed at ${check}.`);
    this.name = "WorkbookInitializationError";
    this.workbookCheck = check;
    this.publicMessage = `Tournament workbook check failed: ${check}.`;
    this.cause = cause;
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
  try {
    required = await readRequired(requiredNames);
  } catch (error) {
    if (readSheet) {
      for (const name of requiredNames) {
        try {
          await readSheet(name);
        } catch (sheetError) {
          throw new WorkbookInitializationError(`required sheet "${name}"`, sheetError);
        }
      }
    }
    throw new WorkbookInitializationError("required normalized-sheet snapshot", error);
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
