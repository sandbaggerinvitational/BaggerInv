import { PREDICTION_SETTING_DEFAULTS } from "./prediction-engine.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PREDICTION_SETTINGS_CONTRACT_VERSION = "prediction-settings-v1";
export const PREDICTION_SETTINGS_SOURCE_TAB = "Prediction Settings";

// These are the exact legacy names accepted by settingsMap(). They remain
// explicitly tested against that parser while existing calculation consumers
// stay on their unchanged runtime path during Step 7B.
export const PREDICTION_SETTING_ALIASES = Object.freeze({
  "Format Win Percentage": "Player - Format Win Percentage Weight",
  "Overall Win Percentage": "Player - Overall Win Percentage Weight",
  "Recent Form": "Player - Recent Form Weight",
  "Average Points Per Match": "Player - Average Points Per Match Weight",
  "Career Points": "Player - Career Points Weight",
  "Tournament Experience": "Player - Tournament Experience Weight",
  "Sandbagger Rating": "Player - Sandbagger Rating Weight",
  "Net Stroke Advantage": "Handicap - Net Stroke Advantage Weight",
  "Front 9 Stroke Advantage": "Handicap - Front 9 Stroke Advantage Weight",
  "Back 9 Stroke Advantage": "Handicap - Back 9 Stroke Advantage Weight",
  "Stroke Hole Distribution": "Handicap - Stroke Hole Distribution Weight",
});

export const PREDICTION_LEGACY_RECALIBRATION_PROFILE = Object.freeze([
  ["Handicap Category Weight", 15],
  ["Player Category Weight", 35],
  ["Team Category Weight", 30],
  ["Opponent Category Weight", 15],
  ["Tournament Category Weight", 5],
  ["Better Player Handicap Difference", 2],
  ["Lesser Player Handicap Difference", 2],
]);

const runtimeDefaults = Object.freeze({
  ...PREDICTION_SETTING_DEFAULTS,
  "Maximum Win Probability": 90,
  "Minimum Win Probability": 10,
  "Minimum Matches for Full Confidence": 8,
  "Prediction Model": "SBI v1.0",
});

const spec = (canonicalKey, category, type, consumer, options = {}) => Object.freeze({
  canonicalKey,
  displayLabel: canonicalKey,
  category,
  type,
  googleRepresentation: type === "boolean" ? "TRUE/FALSE, YES/NO, ON/OFF, or 1/0" : type === "number" || type === "integer" ? "number or numeric text" : "text",
  normalizedRuntimeRepresentation: type,
  defaultValue: runtimeDefaults[canonicalKey],
  aliases: PREDICTION_SETTING_ALIASES[canonicalKey] ? [PREDICTION_SETTING_ALIASES[canonicalKey]] : [],
  consumer,
  affectsCalculationMathematics: options.affectsCalculationMathematics !== false,
  affectsEligibilityOrConfidenceOnly: Boolean(options.affectsEligibilityOrConfidenceOnly),
  ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
  ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
  ...(options.allowedValues ? { allowedValues: Object.freeze([...options.allowedValues]) } : {}),
});

export const PREDICTION_SETTING_SPECS = Object.freeze([
  spec("Handicap Category Weight", "category-weight", "number", "match-prediction"),
  spec("Player Category Weight", "category-weight", "number", "match-prediction"),
  spec("Team Category Weight", "category-weight", "number", "match-prediction"),
  spec("Opponent Category Weight", "category-weight", "number", "match-prediction"),
  spec("Tournament Category Weight", "category-weight", "number", "match-prediction"),

  spec("Format Win Percentage", "player-component", "number", "match-prediction"),
  spec("Overall Win Percentage", "player-component", "number", "match-prediction"),
  spec("Recent Form", "player-component", "number", "match-prediction"),
  spec("Average Points Per Match", "player-component", "number", "match-prediction"),
  spec("Career Points", "player-component", "number", "match-prediction"),
  spec("Tournament Experience", "player-component", "number", "match-prediction"),
  spec("Sandbagger Rating", "player-component", "number", "match-prediction"),

  spec("Net Stroke Advantage", "handicap-component", "number", "match-prediction"),
  spec("Front 9 Stroke Advantage", "handicap-component", "number", "match-prediction"),
  spec("Back 9 Stroke Advantage", "handicap-component", "number", "match-prediction"),
  spec("Stroke Hole Distribution", "handicap-component", "number", "match-prediction"),
  spec("Better Player Handicap Difference", "handicap-component", "number", "match-prediction"),
  spec("Lesser Player Handicap Difference", "handicap-component", "number", "match-prediction"),
  spec("Underlying Skill Points Per Handicap", "handicap-component", "number", "match-prediction"),
  spec("Maximum Underlying Skill Adjustment", "handicap-component", "number", "match-prediction"),

  spec("Scorecard Influence Enabled", "scorecard-calibration", "boolean", "scorecard-calibration", { affectsCalculationMathematics: false, affectsEligibilityOrConfidenceOnly: true }),
  spec("Scorecard Category Weight", "scorecard-calibration", "number", "scorecard-calibration", { minimum: 0 }),
  spec("Maximum Scorecard Adjustment", "scorecard-calibration", "number", "scorecard-calibration", { minimum: 0 }),
  spec("Minimum Scorecard Confidence", "scorecard-calibration", "enum", "scorecard-calibration", { allowedValues: ["Insufficient", "Limited", "Moderate", "Strong"], affectsCalculationMathematics: false, affectsEligibilityOrConfidenceOnly: true }),
  spec("Minimum Scorecard Recorded Rounds", "scorecard-calibration", "integer", "scorecard-calibration", { minimum: 0, affectsCalculationMathematics: false, affectsEligibilityOrConfidenceOnly: true }),
  spec("Minimum Scorecard Recorded Holes", "scorecard-calibration", "integer", "scorecard-calibration", { minimum: 0, affectsCalculationMathematics: false, affectsEligibilityOrConfidenceOnly: true }),

  spec("Maximum Win Probability", "runtime-model", "number", "match-prediction", { minimum: 0, maximum: 100 }),
  spec("Minimum Win Probability", "runtime-model", "number", "match-prediction", { minimum: 0, maximum: 100 }),
  spec("Minimum Matches for Full Confidence", "runtime-model", "number", "match-prediction", { minimum: 0, affectsCalculationMathematics: false, affectsEligibilityOrConfidenceOnly: true }),
  spec("Prediction Model", "runtime-model", "string", "match-prediction", { affectsCalculationMathematics: false }),
]);

if (PREDICTION_SETTING_SPECS.length !== 30) throw new Error("Prediction Settings contract must contain exactly 30 keys.");

export const PREDICTION_SETTINGS_DEFAULTS = Object.freeze(Object.fromEntries(PREDICTION_SETTING_SPECS.map((entry) => [entry.canonicalKey, entry.defaultValue])));

const clean = (value) => String(value ?? "").trim();
const sourceKey = (row) => clean(row?.Setting ?? row?.Name ?? row?.Key);
const sourceValue = (row) => row?.Value ?? row?.["Setting Value"] ?? "";
const isBlank = (value) => value === null || value === undefined || clean(value) === "";

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let normalized = clean(value).replace(/[−–—]/g, "-").replace(/[%,$]/g, "");
  if (/^\(.*\)$/.test(normalized)) normalized = `-${normalized.slice(1, -1)}`;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function typedValue(entry, rawValue) {
  if (isBlank(rawValue)) return { ok: true, value: entry.defaultValue, defaulted: true };
  if (entry.type === "number" || entry.type === "integer") {
    const parsed = numeric(rawValue);
    if (parsed === null) return { ok: false, code: "MALFORMED_NUMERIC_VALUE" };
    const value = entry.type === "integer" ? Math.max(entry.minimum ?? -Infinity, Math.round(parsed)) : parsed;
    if (entry.minimum !== undefined && value < entry.minimum) return { ok: false, code: "VALUE_BELOW_MINIMUM" };
    if (entry.maximum !== undefined && value > entry.maximum) return { ok: false, code: "VALUE_ABOVE_MAXIMUM" };
    return { ok: true, value, defaulted: false };
  }
  if (entry.type === "boolean") {
    if (typeof rawValue === "boolean") return { ok: true, value: rawValue, defaulted: false };
    const normalized = clean(rawValue).toUpperCase();
    if (["TRUE", "YES", "ON", "1"].includes(normalized)) return { ok: true, value: true, defaulted: false };
    if (["FALSE", "NO", "OFF", "0"].includes(normalized)) return { ok: true, value: false, defaulted: false };
    return { ok: false, code: "INVALID_BOOLEAN_VALUE" };
  }
  if (entry.type === "enum") {
    const match = entry.allowedValues.find((candidate) => candidate.toLowerCase() === clean(rawValue).toLowerCase());
    return match ? { ok: true, value: match, defaulted: false } : { ok: false, code: "INVALID_ENUM_VALUE" };
  }
  const value = clean(rawValue);
  return value ? { ok: true, value, defaulted: false } : { ok: false, code: "EMPTY_STRING_VALUE" };
}

function comparable(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  return value;
}

function fail(errors, diagnostics) {
  const error = Object.assign(new Error("Prediction Settings validation failed."), {
    code: "PREDICTION_SETTINGS_INVALID",
    status: 422,
    diagnostics: { ...diagnostics, errors },
  });
  throw error;
}

function normalizedSourceRows(rows = []) {
  return rows.map((row) => ({ ...row })).sort((left, right) => {
    const keyOrder = sourceKey(left).localeCompare(sourceKey(right));
    if (keyOrder) return keyOrder;
    return clean(sourceValue(left)).localeCompare(clean(sourceValue(right)));
  });
}

export function normalizePredictionSettings(rows = []) {
  if (!Array.isArray(rows)) fail([{ code: "SOURCE_ROWS_REQUIRED" }], { recognizedKeyCount: 0 });
  const recognizedNames = new Set(PREDICTION_SETTING_SPECS.flatMap((entry) => [entry.canonicalKey, ...entry.aliases]));
  const unknownSettings = [...new Set(rows.map(sourceKey).filter((name) => name && !recognizedNames.has(name)))].sort();
  const canonicalSettings = {};
  const sourceSettings = {};
  const defaultedKeys = [];
  const shadowedAliases = [];
  const errors = [];

  for (const entry of PREDICTION_SETTING_SPECS) {
    const canonicalRows = rows.filter((row) => sourceKey(row) === entry.canonicalKey);
    const aliasRows = rows.filter((row) => entry.aliases.includes(sourceKey(row)));
    const validateCandidates = (candidates, sourceKind) => {
      const parsed = candidates.filter((row) => !isBlank(sourceValue(row))).map((row) => ({ row, parsed: typedValue(entry, sourceValue(row)) }));
      for (const candidate of parsed) if (!candidate.parsed.ok) errors.push({
        code: candidate.parsed.code,
        key: entry.canonicalKey,
        sourceKey: sourceKey(candidate.row),
        sourceKind,
        value: sourceValue(candidate.row),
        ...(entry.minimum === undefined ? {} : { minimum: entry.minimum }),
        ...(entry.maximum === undefined ? {} : { maximum: entry.maximum }),
        ...(entry.allowedValues ? { allowedValues: entry.allowedValues } : {}),
      });
      const valid = parsed.filter((candidate) => candidate.parsed.ok);
      const values = [...new Set(valid.map((candidate) => JSON.stringify(comparable(candidate.parsed.value))))];
      if (values.length > 1) errors.push({ code: "DUPLICATE_SETTING_CONFLICT", key: entry.canonicalKey, sourceKind, sourceKeys: [...new Set(valid.map((candidate) => sourceKey(candidate.row)))] });
      return valid.at(-1) || null;
    };
    const canonical = validateCandidates(canonicalRows, "canonical");
    const alias = validateCandidates(aliasRows, "legacy-alias");
    const selected = canonical || alias;
    if (canonical && alias && comparable(canonical.parsed.value) !== comparable(alias.parsed.value)) shadowedAliases.push({
      key: entry.canonicalKey,
      canonicalValue: canonical.parsed.value,
      aliasKey: sourceKey(alias.row),
      aliasValue: alias.parsed.value,
      resolution: "CANONICAL_PRECEDENCE",
    });
    const resolved = selected?.parsed || typedValue(entry, undefined);
    canonicalSettings[entry.canonicalKey] = resolved.value;
    if (selected) sourceSettings[entry.canonicalKey] = resolved.value;
    else defaultedKeys.push(entry.canonicalKey);
  }

  const legacyProfile = PREDICTION_LEGACY_RECALIBRATION_PROFILE.every(([name, expected]) =>
    Object.hasOwn(sourceSettings, name) && numeric(sourceSettings[name]) === expected
  );
  const effectiveSettings = { ...canonicalSettings };
  if (legacyProfile) for (const [name, value] of Object.entries(PREDICTION_SETTING_DEFAULTS)) effectiveSettings[name] = value;

  if (effectiveSettings["Minimum Win Probability"] > effectiveSettings["Maximum Win Probability"]) errors.push({
    code: "PROBABILITY_BOUNDS_REVERSED",
    minimum: effectiveSettings["Minimum Win Probability"],
    maximum: effectiveSettings["Maximum Win Probability"],
  });

  const diagnostics = {
    contractVersion: PREDICTION_SETTINGS_CONTRACT_VERSION,
    recognizedKeyCount: PREDICTION_SETTING_SPECS.length,
    sourceRowCount: rows.length,
    defaultedKeys,
    unknownSettings,
    shadowedAliases,
    recalibratedV2: legacyProfile,
    calibrationProfile: legacyProfile ? "Recalibrated v2" : null,
  };
  if (errors.length) fail(errors, diagnostics);
  return { sourceRows: normalizedSourceRows(rows), canonicalSettings, effectiveSettings, diagnostics };
}

export function buildPredictionSettingsProjection({ tournamentId, tournamentYear, sourceWorkbookId, rows = [], requestedBy = "" } = {}) {
  const normalized = normalizePredictionSettings(rows);
  const sourceFingerprint = scoringShadowPayloadHash({
    sourceTab: PREDICTION_SETTINGS_SOURCE_TAB,
    rows: normalized.sourceRows,
  });
  const rawSettingsFingerprint = scoringShadowPayloadHash(normalized.sourceRows);
  const effectiveSettingsFingerprint = scoringShadowPayloadHash(normalized.effectiveSettings);
  return {
    environment: "PREVIEW",
    tournament_id: clean(tournamentId),
    tournament_year: Number(tournamentYear),
    source_workbook_id: clean(sourceWorkbookId),
    source_tab: PREDICTION_SETTINGS_SOURCE_TAB,
    requested_by: clean(requestedBy || "Prediction Settings synchronization"),
    settings: normalized.sourceRows,
    source_fingerprint: sourceFingerprint,
    settings_fingerprint: rawSettingsFingerprint,
    canonical_settings: normalized.canonicalSettings,
    effective_settings: normalized.effectiveSettings,
    effective_settings_fingerprint: effectiveSettingsFingerprint,
    settings_contract_version: PREDICTION_SETTINGS_CONTRACT_VERSION,
    validation_status: "VALID",
    validation_diagnostics: normalized.diagnostics,
  };
}

export function comparePredictionSettingsProjection(expected = {}, actual = {}) {
  const expectedEffective = expected.effective_settings || expected.effectiveSettings || {};
  const actualEffective = actual.effective_settings || actual.effectiveSettings || {};
  const expectedCanonical = expected.canonical_settings || expected.canonicalSettings || {};
  const actualCanonical = actual.canonical_settings || actual.canonicalSettings || {};
  const effectiveExpectedHash = expected.effective_settings_fingerprint || expected.effectiveSettingsFingerprint || scoringShadowPayloadHash(expectedEffective);
  const effectiveActualHash = actual.effective_settings_fingerprint || actual.effectiveSettingsFingerprint || scoringShadowPayloadHash(actualEffective);
  const canonicalExpectedHash = scoringShadowPayloadHash(expectedCanonical);
  const canonicalActualHash = scoringShadowPayloadHash(actualCanonical);
  const expectedSourceFingerprint = expected.source_fingerprint || expected.sourceFingerprint || "";
  const actualSourceFingerprint = actual.source_fingerprint || actual.sourceFingerprint || "";
  const expectedRawFingerprint = expected.settings_fingerprint || expected.rawSettingsFingerprint || "";
  const actualRawFingerprint = actual.settings_fingerprint || actual.rawSettingsFingerprint || "";
  const expectedContract = expected.settings_contract_version || expected.contractVersion || "";
  const actualContract = actual.settings_contract_version || actual.contractVersion || "";
  const sourceParity = Boolean(expectedSourceFingerprint) && expectedSourceFingerprint === actualSourceFingerprint;
  const rawSettingsParity = Boolean(expectedRawFingerprint) && expectedRawFingerprint === actualRawFingerprint;
  const contractParity = Boolean(expectedContract) && expectedContract === actualContract;
  return {
    pass: effectiveExpectedHash === effectiveActualHash && canonicalExpectedHash === canonicalActualHash && sourceParity && rawSettingsParity && contractParity,
    sourceParity,
    rawSettingsParity,
    contractParity,
    effectiveSettingsParity: effectiveExpectedHash === effectiveActualHash,
    canonicalSettingsParity: canonicalExpectedHash === canonicalActualHash,
    expectedEffectiveFingerprint: effectiveExpectedHash,
    actualEffectiveFingerprint: effectiveActualHash,
    expectedCanonicalFingerprint: canonicalExpectedHash,
    actualCanonicalFingerprint: canonicalActualHash,
  };
}
