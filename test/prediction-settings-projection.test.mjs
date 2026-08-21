import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PREDICTION_SETTING_DEFAULTS,
  setting,
  settingsMap,
} from "../lib/prediction-engine.js";
import { scorecardCalibrationSettings } from "../lib/scorecard-calibration.js";
import {
  buildPredictionSettingsProjection,
  comparePredictionSettingsProjection,
  normalizePredictionSettings,
  PREDICTION_SETTING_ALIASES,
  PREDICTION_SETTING_SPECS,
  PREDICTION_SETTINGS_CONTRACT_VERSION,
  PREDICTION_SETTINGS_DEFAULTS,
} from "../lib/prediction-settings-contract.js";
import {
  loadPredictionSettingsFromSelectedSource,
  predictionSettingsEnvironment,
} from "../lib/prediction-settings-source.js";
import { predictionSettingsFreshness } from "../lib/prediction-settings-supabase.js";

const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://example.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "secret",
};

const rowsFromDefaults = () => PREDICTION_SETTING_SPECS.map((entry) => ({
  Setting: entry.canonicalKey,
  Value: entry.type === "boolean" ? (entry.defaultValue ? "TRUE" : "FALSE") : String(entry.defaultValue),
  Description: entry.category,
}));

test("typed Prediction Settings contract contains exactly the 30 runtime keys", () => {
  assert.equal(PREDICTION_SETTING_SPECS.length, 30);
  assert.equal(new Set(PREDICTION_SETTING_SPECS.map((entry) => entry.canonicalKey)).size, 30);
  assert.equal(Object.keys(PREDICTION_SETTINGS_DEFAULTS).length, 30);
  assert.equal(PREDICTION_SETTINGS_CONTRACT_VERSION, "prediction-settings-v1");
  for (const entry of PREDICTION_SETTING_SPECS) {
    assert.ok(entry.displayLabel);
    assert.ok(entry.category);
    assert.ok(["number", "integer", "boolean", "enum", "string"].includes(entry.type));
    assert.ok(entry.googleRepresentation);
    assert.ok(entry.normalizedRuntimeRepresentation);
    assert.ok(entry.consumer);
    assert.ok(Object.hasOwn(entry, "affectsCalculationMathematics"));
    assert.ok(Object.hasOwn(entry, "affectsEligibilityOrConfidenceOnly"));
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(PREDICTION_SETTING_DEFAULTS)),
    Object.fromEntries(Object.entries(PREDICTION_SETTINGS_DEFAULTS).filter(([key]) => Object.hasOwn(PREDICTION_SETTING_DEFAULTS, key)))
  );
});

test("typed normalization reproduces the existing effective default configuration", () => {
  const rows = rowsFromDefaults();
  const normalized = normalizePredictionSettings(rows);
  const legacy = settingsMap(rows);
  const calibration = scorecardCalibrationSettings(legacy);
  const scorecardValues = {
    "Scorecard Influence Enabled": calibration.enabled,
    "Scorecard Category Weight": calibration.categoryWeight,
    "Maximum Scorecard Adjustment": calibration.maximumAdjustment,
    "Minimum Scorecard Confidence": calibration.minimumConfidence,
    "Minimum Scorecard Recorded Rounds": calibration.minimumRecordedRounds,
    "Minimum Scorecard Recorded Holes": calibration.minimumRecordedHoles,
  };
  for (const entry of PREDICTION_SETTING_SPECS) {
    const legacyValue = Object.hasOwn(scorecardValues, entry.canonicalKey)
      ? scorecardValues[entry.canonicalKey]
      : setting(legacy, entry.canonicalKey, entry.defaultValue);
    assert.equal(normalized.effectiveSettings[entry.canonicalKey], legacyValue, entry.canonicalKey);
  }
  assert.equal(normalized.diagnostics.defaultedKeys.length, 0);
});

test("missing settings retain existing runtime defaults without inventing required keys", () => {
  const normalized = normalizePredictionSettings([]);
  assert.deepEqual(normalized.canonicalSettings, PREDICTION_SETTINGS_DEFAULTS);
  assert.deepEqual(normalized.effectiveSettings, PREDICTION_SETTINGS_DEFAULTS);
  assert.equal(normalized.diagnostics.defaultedKeys.length, 30);
});

test("numeric, boolean, enum, integer, and string representations are typed", () => {
  const normalized = normalizePredictionSettings([
    { Setting: "Player Category Weight", Value: "42%" },
    { Setting: "Underlying Skill Points Per Handicap", Value: ".50" },
    { Setting: "Scorecard Influence Enabled", Value: "YES" },
    { Setting: "Minimum Scorecard Confidence", Value: "strong" },
    { Setting: "Minimum Scorecard Recorded Rounds", Value: "2.4" },
    { Setting: "Prediction Model", Value: " SBI v1.0 " },
  ]);
  assert.equal(normalized.canonicalSettings["Player Category Weight"], 42);
  assert.equal(normalized.canonicalSettings["Underlying Skill Points Per Handicap"], .5);
  assert.equal(normalized.canonicalSettings["Scorecard Influence Enabled"], true);
  assert.equal(normalized.canonicalSettings["Minimum Scorecard Confidence"], "Strong");
  assert.equal(normalized.canonicalSettings["Minimum Scorecard Recorded Rounds"], 2);
  assert.equal(normalized.canonicalSettings["Prediction Model"], "SBI v1.0");
});

test("legacy aliases normalize once and canonical values retain deterministic precedence", () => {
  const normalized = normalizePredictionSettings([
    { Setting: "Player - Format Win Percentage Weight", Value: "25" },
    { Setting: "Format Win Percentage", Value: "28" },
    { Setting: "Handicap - Net Stroke Advantage Weight", Value: "20" },
  ]);
  assert.equal(normalized.canonicalSettings["Format Win Percentage"], 28);
  assert.equal(normalized.canonicalSettings["Net Stroke Advantage"], 20);
  assert.equal(normalized.diagnostics.shadowedAliases.length, 1);
  assert.equal(normalized.diagnostics.shadowedAliases[0].resolution, "CANONICAL_PRECEDENCE");
});

test("all eleven legacy aliases match the unchanged runtime parser", () => {
  assert.equal(Object.keys(PREDICTION_SETTING_ALIASES).length, 11);
  for (const [canonical, alias] of Object.entries(PREDICTION_SETTING_ALIASES)) {
    const rows = [{ Setting: alias, Value: "17.5" }];
    assert.equal(normalizePredictionSettings(rows).canonicalSettings[canonical], 17.5, alias);
    assert.equal(setting(settingsMap(rows), canonical, null), 17.5, alias);
  }
});

test("legacy recalibrated-v2 source and effective settings remain distinct", () => {
  const rows = [
    ["Handicap Category Weight", 15],
    ["Player Category Weight", 35],
    ["Team Category Weight", 30],
    ["Opponent Category Weight", 15],
    ["Tournament Category Weight", 5],
    ["Better Player Handicap Difference", 2],
    ["Lesser Player Handicap Difference", 2],
    ["Player - Format Win Percentage Weight", 25],
    ["Handicap - Net Stroke Advantage Weight", 25],
  ].map(([Setting, Value]) => ({ Setting, Value }));
  const normalized = normalizePredictionSettings(rows);
  const legacy = settingsMap(rows);
  assert.equal(normalized.canonicalSettings["Handicap Category Weight"], 15);
  assert.equal(normalized.canonicalSettings["Format Win Percentage"], 25);
  assert.equal(normalized.effectiveSettings["Handicap Category Weight"], 12);
  assert.equal(normalized.effectiveSettings["Format Win Percentage"], 28);
  assert.equal(normalized.effectiveSettings["Net Stroke Advantage"], 20);
  assert.equal(normalized.diagnostics.recalibratedV2, true);
  assert.equal(normalized.diagnostics.calibrationProfile, "Recalibrated v2");
  for (const [key, value] of Object.entries(PREDICTION_SETTING_DEFAULTS)) assert.equal(normalized.effectiveSettings[key], value);
  assert.equal(legacy["Prediction Calibration Profile"], "Recalibrated v2");
});

test("malformed and ambiguous recognized settings fail closed", () => {
  for (const row of [
    { Setting: "Player Category Weight", Value: "forty-two" },
    { Setting: "Scorecard Influence Enabled", Value: "sometimes" },
    { Setting: "Minimum Scorecard Confidence", Value: "Excellent" },
  ]) assert.throws(() => normalizePredictionSettings([row]), (error) => error.code === "PREDICTION_SETTINGS_INVALID" && error.diagnostics.errors.length === 1);
  assert.throws(() => normalizePredictionSettings([
    { Setting: "Player Category Weight", Value: "42" },
    { Setting: "Player Category Weight", Value: "35" },
  ]), (error) => error.code === "PREDICTION_SETTINGS_INVALID" && error.diagnostics.errors.some((item) => item.code === "DUPLICATE_SETTING_CONFLICT"));
  assert.throws(() => normalizePredictionSettings([
    { Setting: "Minimum Win Probability", Value: "80" },
    { Setting: "Maximum Win Probability", Value: "20" },
  ]), (error) => error.code === "PREDICTION_SETTINGS_INVALID" && error.diagnostics.errors.some((item) => item.code === "PROBABILITY_BOUNDS_REVERSED"));
});

test("source and effective fingerprints are deterministic and preserve provenance distinctions", () => {
  const firstRows = rowsFromDefaults();
  const reordered = [...firstRows].reverse();
  const metadataChanged = reordered.map((row) => ({ ...row, "Updated At": "later" }));
  const first = buildPredictionSettingsProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", rows: firstRows, requestedBy: "DIRECTOR" });
  const second = buildPredictionSettingsProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", rows: reordered, requestedBy: "DIRECTOR" });
  const third = buildPredictionSettingsProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", rows: metadataChanged, requestedBy: "DIRECTOR" });
  assert.equal(first.source_fingerprint, second.source_fingerprint);
  assert.equal(first.effective_settings_fingerprint, second.effective_settings_fingerprint);
  assert.equal(comparePredictionSettingsProjection(first, second).pass, true);
  assert.notEqual(first.source_fingerprint, third.source_fingerprint);
  assert.notEqual(first.settings_fingerprint, third.settings_fingerprint);
  assert.equal(first.effective_settings_fingerprint, third.effective_settings_fingerprint);
  assert.equal(comparePredictionSettingsProjection(first, third).pass, false);
  assert.equal(comparePredictionSettingsProjection(first, third).effectiveSettingsParity, true);
  assert.equal(comparePredictionSettingsProjection(first, third).sourceParity, false);
  assert.match(first.source_fingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.effective_settings_fingerprint, /^[0-9a-f]{64}$/);
});

test("freshness distinguishes current, stale, invalid, unavailable, and unchecked projections", () => {
  const stored = { projectionStatus: "VALID", validationStatus: "VALID", sourceFingerprint: "a".repeat(64) };
  assert.equal(predictionSettingsFreshness({ stored, source: { source_fingerprint: "a".repeat(64) } }).status, "CURRENT");
  assert.equal(predictionSettingsFreshness({ stored, source: { source_fingerprint: "b".repeat(64) } }).status, "STALE");
  assert.equal(predictionSettingsFreshness({ stored }).status, "UNKNOWN");
  assert.equal(predictionSettingsFreshness({ stored, sourceError: new Error("Google unavailable") }).status, "UNKNOWN");
  assert.equal(predictionSettingsFreshness({ stored: { ...stored, validationStatus: "INVALID" } }).status, "INVALID");
  assert.equal(predictionSettingsFreshness({ stored: null }).status, "UNAVAILABLE");
});

test("Preview source boundary is reversible, Production-hard-blocked, and never falls back", async () => {
  const supabaseGate = predictionSettingsEnvironment({ ...previewEnv, PREDICTION_SETTINGS_READ_SOURCE: "supabase" });
  const googleGate = predictionSettingsEnvironment({ ...previewEnv, PREDICTION_SETTINGS_READ_SOURCE: "google" });
  const productionGate = predictionSettingsEnvironment({ ...previewEnv, VERCEL_ENV: "production", PREDICTION_SETTINGS_READ_SOURCE: "supabase" });
  assert.equal(supabaseGate.source, "supabase");
  assert.equal(googleGate.source, "google");
  assert.equal(productionGate.source, "google");
  assert.equal(productionGate.productionHardBlock, true);

  let googleCalls = 0;
  let supabaseCalls = 0;
  const supabase = await loadPredictionSettingsFromSelectedSource({
    env: { ...previewEnv, PREDICTION_SETTINGS_READ_SOURCE: "supabase" },
    googleLoader: async () => { googleCalls += 1; return "google"; },
    supabaseLoader: async () => { supabaseCalls += 1; return "supabase"; },
  });
  assert.equal(supabase.projection, "supabase");
  assert.deepEqual([googleCalls, supabaseCalls], [0, 1]);
  await assert.rejects(() => loadPredictionSettingsFromSelectedSource({
    env: { ...previewEnv, PREDICTION_SETTINGS_READ_SOURCE: "supabase" },
    googleLoader: async () => { googleCalls += 1; return "fallback"; },
    supabaseLoader: async () => { throw Object.assign(new Error("down"), { code: "SUPABASE_DOWN" }); },
  }), /down/);
  assert.equal(googleCalls, 0);
});

test("projection migration reuses Odds configuration revisions and the route reads one Google tab", async () => {
  const [migration, route, sourceGate, warRoom, optimizer, intelligence, oddsEngine] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608210011_preview_prediction_settings_projection.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/odds/prediction-settings/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/prediction-settings-source.js", import.meta.url), "utf8"),
    readFile(new URL("../app/war-room/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/war-room/lineup-optimizer/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/war-room/team-intelligence/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-odds.js", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /alter table scoring_authority\.odds_input_configurations/);
  assert.doesNotMatch(migration, /create table .*prediction_settings/i);
  assert.match(migration, /import_preview_prediction_settings/);
  assert.match(migration, /read_preview_prediction_settings/);
  assert.match(migration, /current_config\.historical_ratings/);
  assert.match(migration, /jsonb_object_length\(input->'effective_settings'\) <> 30/);
  assert.match(migration, /'NO_CHANGE'/);
  assert.match(migration, /PREDICTION_SETTINGS_VERSIONED/);
  assert.match(migration, /PREVIEW_ENVIRONMENT_REQUIRED/);
  assert.match(migration, /grant execute on function public\.read_preview_prediction_settings\(text\) to service_role/);
  assert.match(route, /readWorkbookSheetsByName\(\[PREDICTION_SETTINGS_SOURCE_TAB\]\)/);
  assert.doesNotMatch(route, /loadPredictionSheets/);
  assert.doesNotMatch(route, /simulateTournamentOdds/);
  assert.match(route, /Tournament Director access is required/);
  assert.match(sourceGate, /PREDICTION_SETTINGS_READ_SOURCE/);
  assert.match(sourceGate, /productionHardBlock/);
  for (const consumer of [warRoom, optimizer, intelligence, oddsEngine]) assert.doesNotMatch(consumer, /prediction-settings-source|loadPredictionSettingsFromSelectedSource/);
});
