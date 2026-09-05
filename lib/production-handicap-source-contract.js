import { createHash } from "node:crypto";

import { canonicalProductionHandicapDecimal } from "./production-handicap-contract.js";

export const PRODUCTION_HANDICAP_SOURCE_CONTRACT =
  "production-handicap-source-v1";

const clean = (value) => String(value ?? "").trim();
const PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GHIN = /^[0-9]{5,12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GOLF_HANDICAP = /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function sourceError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value === undefined ? null : value;
}

export function productionHandicapSourcePayloadHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function canonicalGhinNumber(value) {
  const result = clean(value).replace(/[ -]/g, "");
  if (!GHIN.test(result)) {
    throw sourceError(
      "PRODUCTION_GHIN_IDENTIFIER_INVALID",
      "Enter a valid GHIN Number using digits only.",
    );
  }
  return result;
}

export function canonicalGolfHandicap(value) {
  const source = clean(value);
  if (!source || source.toUpperCase() === "NH" || !GOLF_HANDICAP.test(source)) {
    throw sourceError(
      "PRODUCTION_HANDICAP_SOURCE_DECIMAL_INVALID",
      "Enter a valid golf handicap. Plus handicaps may use a leading +.",
    );
  }
  const conventionalPlus = source.startsWith("+");
  const decimal = canonicalProductionHandicapDecimal(source.replace(/^\+/, ""));
  if (decimal === "0") return "0";
  return conventionalPlus ? `-${decimal}` : decimal;
}

function exactPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!PLAYER_ID.test(result)) {
    throw sourceError("PRODUCTION_HANDICAP_SOURCE_PLAYER_REQUIRED", "A stable Player ID is required.");
  }
  return result;
}

function optionalUuid(value, code) {
  const result = clean(value).toLowerCase();
  if (!result) return null;
  if (!UUID.test(result)) throw sourceError(code, "The expected source identity is invalid.");
  return result;
}

function exactRevision(value, code) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw sourceError(code, "The exact predecessor revision is required.");
  }
  return result;
}

function exactDate(value, code) {
  const result = clean(value);
  const parsed = Date.parse(`${result}T00:00:00.000Z`);
  if (!DATE.test(result) || !Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0, 10) !== result) {
    throw sourceError(code, "A valid date is required.");
  }
  return result;
}

function optionalDate(value, code) {
  return clean(value) ? exactDate(value, code) : null;
}

function canonicalBulkRows(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw sourceError(
      "PRODUCTION_HANDICAP_SOURCE_BULK_ROWS_REQUIRED",
      "Enter between 1 and 100 Current/Low source rows.",
    );
  }
  const entries = value.map((entry) => ({
    player_id: exactPlayerId(entry.playerId ?? entry.player_id),
    current_index: canonicalGolfHandicap(entry.currentIndex ?? entry.current_index),
    low_index: canonicalGolfHandicap(entry.lowIndex ?? entry.low_index),
    low_index_date: optionalDate(
      entry.lowIndexDate ?? entry.low_index_date,
      "PRODUCTION_HANDICAP_SOURCE_LOW_DATE_INVALID",
    ),
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (new Set(entries.map((entry) => entry.player_id)).size !== entries.length) {
    throw sourceError(
      "PRODUCTION_HANDICAP_SOURCE_DUPLICATE_PLAYER",
      "Each Player ID may appear only once in a bulk import.",
    );
  }
  return entries;
}

export function parseBulkManualHandicapSource(value) {
  const source = String(value ?? "");
  if (source.length > 50_000) {
    return {
      rowsParsed: 0,
      entries: [],
      rows: [],
      errors: [{ rowNumber: null, code: "PAYLOAD_TOO_LARGE", message: "Bulk source input is too large." }],
    };
  }
  const lines = source.split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), rowNumber: index + 1 }))
    .filter(({ line }) => line);
  if (!lines.length) {
    return {
      rowsParsed: 0,
      entries: [],
      rows: [],
      errors: [{ rowNumber: null, code: "ROWS_REQUIRED", message: "Paste at least one Player row." }],
    };
  }
  const rows = lines.map(({ line, rowNumber }) => {
    const hasTab = line.includes("\t");
    const hasComma = line.includes(",");
    const columns = hasTab && !hasComma
      ? line.split("\t").map((column) => column.trim())
      : hasComma && !hasTab
        ? line.split(",").map((column) => column.trim())
        : [];
    const playerId = clean(columns[0]).toUpperCase();
    const row = {
      rowNumber,
      playerId,
      currentIndex: null,
      lowIndex: null,
      lowIndexDate: null,
      status: "READY_FOR_SERVER_VALIDATION",
      message: "Ready for roster and identity validation.",
    };
    if (columns.length < 3 || columns.length > 4) {
      return { ...row, status: "INVALID_FORMAT", message: "Use Player ID, Current HI, Low HI, and optional Low HI Date." };
    }
    try { row.playerId = exactPlayerId(columns[0]); }
    catch { return { ...row, status: "INVALID_PLAYER_ID", message: "Enter a valid stable Player ID." }; }
    try { row.currentIndex = canonicalGolfHandicap(columns[1]); }
    catch { return { ...row, status: "INVALID_CURRENT_HI", message: "Enter a valid Current HI." }; }
    try { row.lowIndex = canonicalGolfHandicap(columns[2]); }
    catch { return { ...row, status: "INVALID_LOW_HI", message: "Enter a valid Low HI." }; }
    try {
      row.lowIndexDate = optionalDate(columns[3], "PRODUCTION_HANDICAP_SOURCE_LOW_DATE_INVALID");
    } catch {
      return { ...row, status: "INVALID_LOW_HI_DATE", message: "Use a real Low HI Date in YYYY-MM-DD format." };
    }
    return row;
  });
  const counts = new Map();
  for (const row of rows) {
    if (row.playerId) counts.set(row.playerId, (counts.get(row.playerId) || 0) + 1);
  }
  for (const row of rows) {
    if (row.playerId && counts.get(row.playerId) > 1) {
      row.status = "DUPLICATE_PLAYER";
      row.message = "This Player ID appears more than once.";
    }
  }
  const errors = rows.filter((row) => row.status !== "READY_FOR_SERVER_VALIDATION")
    .map(({ rowNumber, playerId, status: code, message }) => ({ rowNumber, playerId, code, message }));
  return {
    rowsParsed: rows.length,
    entries: errors.length ? [] : rows.map(({ playerId, currentIndex, lowIndex, lowIndexDate }) => ({
      player_id: playerId,
      current_index: currentIndex,
      low_index: lowIndex,
      low_index_date: lowIndexDate,
    })),
    rows,
    errors,
  };
}

export function canonicalBulkManualHandicapSourcePreviewInput(input = {}) {
  return { entries: canonicalBulkRows(input.entries) };
}

export function canonicalBulkManualHandicapSourceSaveInput(input = {}) {
  const previewFingerprint = clean(
    input.expectedPreviewFingerprint ?? input.expected_preview_fingerprint,
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(previewFingerprint)) {
    throw sourceError(
      "PRODUCTION_HANDICAP_SOURCE_BULK_PREVIEW_REQUIRED",
      "Preview the complete bulk import again before saving.",
    );
  }
  return {
    expected_preview_fingerprint: previewFingerprint,
    entry_mode: "BULK_IMPORT",
    entries: canonicalBulkRows(input.entries),
  };
}

export function canonicalGhinIdentityInput(input = {}) {
  return {
    player_id: exactPlayerId(input.playerId ?? input.player_id),
    external_identifier: canonicalGhinNumber(input.ghinNumber ?? input.external_identifier),
    expected_identity_id: optionalUuid(
      input.expectedIdentityId ?? input.expected_identity_id,
      "PRODUCTION_GHIN_EXPECTED_IDENTITY_INVALID",
    ),
    replace_confirmed: input.replaceConfirmed === true || input.replace_confirmed === true,
  };
}

export function canonicalGhinRetirementInput(input = {}) {
  const identityId = optionalUuid(
    input.expectedIdentityId ?? input.expected_identity_id,
    "PRODUCTION_GHIN_EXPECTED_IDENTITY_INVALID",
  );
  if (!identityId) {
    throw sourceError("PRODUCTION_GHIN_EXPECTED_IDENTITY_REQUIRED", "The current GHIN identity is required.");
  }
  return {
    player_id: exactPlayerId(input.playerId ?? input.player_id),
    expected_identity_id: identityId,
    retirement_confirmed: input.retirementConfirmed === true || input.retirement_confirmed === true,
  };
}

export function canonicalManualHandicapSourceInput(input = {}) {
  const identityId = optionalUuid(
    input.expectedIdentityId ?? input.expected_identity_id,
    "PRODUCTION_GHIN_EXPECTED_IDENTITY_INVALID",
  );
  if (!identityId) {
    throw sourceError("PRODUCTION_GHIN_EXPECTED_IDENTITY_REQUIRED", "A verified GHIN identity is required.");
  }
  return {
    player_id: exactPlayerId(input.playerId ?? input.player_id),
    expected_identity_id: identityId,
    expected_pointer_revision: exactRevision(
      input.expectedPointerRevision ?? input.expected_pointer_revision ?? 0,
      "PRODUCTION_HANDICAP_SOURCE_PREDECESSOR_REQUIRED",
    ),
    current_index: canonicalGolfHandicap(input.currentIndex ?? input.current_index),
    low_index: canonicalGolfHandicap(input.lowIndex ?? input.low_index),
    low_index_date: exactDate(
      input.lowIndexDate ?? input.low_index_date,
      "PRODUCTION_HANDICAP_SOURCE_LOW_DATE_REQUIRED",
    ),
    provenance: "DIRECTOR_MANUAL",
  };
}

export function canonicalHybridDraftInput(input = {}) {
  const sourceFingerprint = clean(input.expectedSourceFingerprint ?? input.expected_source_fingerprint).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceFingerprint)) {
    throw sourceError("PRODUCTION_HANDICAP_SOURCE_FINGERPRINT_REQUIRED", "Refresh source evidence before staging.");
  }
  if (!Array.isArray(input.entries) || !input.entries.length) {
    throw sourceError("PRODUCTION_HANDICAP_COMPLETE_ROSTER_REQUIRED", "The complete roster is required.");
  }
  const entries = input.entries.map((entry) => ({
    player_id: exactPlayerId(entry.playerId ?? entry.player_id),
    tournament_handicap: canonicalProductionHandicapDecimal(
      entry.proposedHandicap ?? entry.tournamentHandicap ?? entry.tournament_handicap,
    ),
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (new Set(entries.map((entry) => entry.player_id)).size !== entries.length) {
    throw sourceError("PRODUCTION_HANDICAP_DUPLICATE_PLAYER", "Each active Player must appear once.");
  }
  return {
    expected_predecessor_revision: exactRevision(
      input.expectedRevision ?? input.expected_predecessor_revision,
      "PRODUCTION_HANDICAP_PREDECESSOR_REVISION_REQUIRED",
    ),
    expected_source_fingerprint: sourceFingerprint,
    effective_date: exactDate(
      input.effectiveDate ?? input.effective_date,
      "PRODUCTION_HANDICAP_EFFECTIVE_DATE_REQUIRED",
    ),
    entries,
  };
}
