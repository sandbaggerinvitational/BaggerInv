import {
  normalizePredictionSettings,
  PREDICTION_SETTING_SPECS,
  PREDICTION_SETTINGS_CONTRACT_VERSION,
} from "./prediction-settings-contract.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_PREDICTION_SETTINGS_AUTHORING_CONTRACT =
  "production-prediction-settings-authoring-v1";

const clean = (value) => String(value ?? "").trim();

const CATEGORY_METADATA = Object.freeze({
  "category-weight": Object.freeze({
    label: "Model weighting",
    description: "Relative influence of each major matchup-prediction category.",
  }),
  "player-component": Object.freeze({
    label: "Player weighting",
    description: "Relative influence of the player-history measures within the Player category.",
  }),
  "handicap-component": Object.freeze({
    label: "Handicap weighting",
    description: "Relative influence of handicap and stroke-allocation measures.",
  }),
  "scorecard-calibration": Object.freeze({
    label: "Scorecard calibration",
    description: "Eligibility thresholds and bounded calibration values used by the existing scorecard model.",
  }),
  "runtime-model": Object.freeze({
    label: "Probability and model",
    description: "Existing probability limits, confidence threshold, and model label.",
  }),
});

const DESCRIPTIONS = Object.freeze({
  "Handicap Category Weight": "Relative weight of the handicap category.",
  "Player Category Weight": "Relative weight of player history and strength.",
  "Team Category Weight": "Relative weight of team partnership history.",
  "Opponent Category Weight": "Relative weight of head-to-head history.",
  "Tournament Category Weight": "Relative weight of tournament experience.",
  "Format Win Percentage": "Weight of results in the current match format.",
  "Overall Win Percentage": "Weight of overall career win percentage.",
  "Recent Form": "Weight of recent tournament form.",
  "Average Points Per Match": "Weight of average points earned per match.",
  "Career Points": "Weight of total career points.",
  "Tournament Experience": "Weight of prior tournament experience.",
  "Sandbagger Rating": "Weight of the existing Sandbagger Rating.",
  "Net Stroke Advantage": "Weight of overall net-stroke advantage.",
  "Front 9 Stroke Advantage": "Weight of front-nine stroke advantage.",
  "Back 9 Stroke Advantage": "Weight of back-nine stroke advantage.",
  "Stroke Hole Distribution": "Weight of where allocated strokes fall across the course.",
  "Better Player Handicap Difference": "Relative weight assigned to the lower handicap on a side.",
  "Lesser Player Handicap Difference": "Relative weight assigned to the higher handicap on a side.",
  "Underlying Skill Points Per Handicap": "Prediction adjustment per handicap-index point.",
  "Maximum Underlying Skill Adjustment": "Absolute cap on the underlying-skill adjustment.",
  "Scorecard Influence Enabled": "Preserved existing scorecard-calibration switch metadata.",
  "Scorecard Category Weight": "Weight used by the existing scorecard calibration.",
  "Maximum Scorecard Adjustment": "Maximum scorecard calibration adjustment.",
  "Minimum Scorecard Confidence": "Minimum confidence required for scorecard calibration.",
  "Minimum Scorecard Recorded Rounds": "Minimum recorded rounds required for scorecard calibration.",
  "Minimum Scorecard Recorded Holes": "Minimum recorded holes required for scorecard calibration.",
  "Maximum Win Probability": "Upper bound for a matchup win probability.",
  "Minimum Win Probability": "Lower bound for a matchup win probability.",
  "Minimum Matches for Full Confidence": "Match-count threshold used by the existing confidence label.",
  "Prediction Model": "Version label returned with the existing prediction model.",
});

const canonicalByAcceptedKey = new Map(PREDICTION_SETTING_SPECS.flatMap((entry) => [
  [entry.canonicalKey, entry.canonicalKey],
  ...entry.aliases.map((alias) => [alias, entry.canonicalKey]),
]));

function authoringError(code, message, issues = []) {
  const error = new Error(message);
  error.code = code;
  error.status = 422;
  error.diagnostics = { issues };
  return error;
}

export const PRODUCTION_PREDICTION_SETTING_SPECS = Object.freeze(
  PREDICTION_SETTING_SPECS.map((entry, index) => Object.freeze({
    ...entry,
    order: index + 1,
    description: DESCRIPTIONS[entry.canonicalKey],
    categoryLabel: CATEGORY_METADATA[entry.category].label,
    categoryDescription: CATEGORY_METADATA[entry.category].description,
  })),
);

export const PRODUCTION_PREDICTION_SETTING_CATEGORIES = Object.freeze(
  Object.entries(CATEGORY_METADATA).map(([id, metadata]) => Object.freeze({
    id,
    ...metadata,
    settings: PRODUCTION_PREDICTION_SETTING_SPECS
      .filter((entry) => entry.category === id)
      .map((entry) => entry.canonicalKey),
  })),
);

function rowsFromInput(settings) {
  if (Array.isArray(settings)) {
    return settings.map((row) => ({
      Setting: clean(row?.Setting ?? row?.Name ?? row?.Key),
      Value: row?.Value ?? row?.["Setting Value"] ?? "",
    }));
  }
  if (!settings || typeof settings !== "object") {
    throw authoringError(
      "PREDICTION_SETTINGS_COMPLETE_SCHEMA_REQUIRED",
      "A complete Prediction Settings configuration is required.",
    );
  }
  return Object.entries(settings).map(([Setting, Value]) => ({ Setting, Value }));
}

/**
 * The historical Google normalizer intentionally records unknown rows as
 * diagnostics. The Director mutation boundary is stricter: it rejects unknown
 * names and requires every canonical setting to be represented, while keeping
 * all existing parsing, alias, default, rounding, and legacy-profile behavior.
 */
export function normalizeProductionPredictionSettingsAuthoring(settings) {
  const rows = rowsFromInput(settings);
  const unknown = [...new Set(rows.map((row) => clean(row.Setting))
    .filter((key) => key && !canonicalByAcceptedKey.has(key)))].sort();
  if (unknown.length) {
    throw authoringError(
      "PREDICTION_SETTINGS_UNKNOWN_SETTING",
      "The proposed configuration contains an unsupported Prediction Setting.",
      unknown.map((key) => ({ code: "UNKNOWN_SETTING", key })),
    );
  }
  const represented = new Set(rows.map((row) => canonicalByAcceptedKey.get(clean(row.Setting)))
    .filter(Boolean));
  const missing = PREDICTION_SETTING_SPECS
    .map((entry) => entry.canonicalKey)
    .filter((key) => !represented.has(key));
  if (missing.length) {
    throw authoringError(
      "PREDICTION_SETTINGS_COMPLETE_SCHEMA_REQUIRED",
      "All 30 Prediction Settings are required before review.",
      missing.map((key) => ({ code: "MISSING_SETTING", key })),
    );
  }
  const normalized = normalizePredictionSettings(rows);
  const canonicalRows = PREDICTION_SETTING_SPECS.map((entry) => ({
    Setting: entry.canonicalKey,
    Value: normalized.canonicalSettings[entry.canonicalKey],
  }));
  return Object.freeze({
    contractVersion: PRODUCTION_PREDICTION_SETTINGS_AUTHORING_CONTRACT,
    settingsContractVersion: PREDICTION_SETTINGS_CONTRACT_VERSION,
    settings: canonicalRows,
    canonicalSettings: Object.freeze({ ...normalized.canonicalSettings }),
    effectiveSettings: Object.freeze({ ...normalized.effectiveSettings }),
    diagnostics: Object.freeze({
      ...normalized.diagnostics,
      unknownSettings: [],
      completeSchema: true,
    }),
    settingsFingerprint: scoringShadowPayloadHash(canonicalRows),
    effectiveSettingsFingerprint: scoringShadowPayloadHash(normalized.effectiveSettings),
  });
}

export function productionPredictionSettingsPayloadHash(value) {
  return scoringShadowPayloadHash({
    contractVersion: PRODUCTION_PREDICTION_SETTINGS_AUTHORING_CONTRACT,
    value,
  });
}

export function predictionSettingsChangedKeys(current = {}, proposed = {}) {
  return PREDICTION_SETTING_SPECS.map((entry) => entry.canonicalKey)
    .filter((key) => JSON.stringify(current?.[key]) !== JSON.stringify(proposed?.[key]));
}
