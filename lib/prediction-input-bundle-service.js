import "server-only";

import { cache } from "react";

import { readOddsInputBundle } from "./championship-odds-supabase.js";
import {
  buildPredictionInputBundle,
  predictionInputCompatibilityReport,
  scopePredictionInputBundle,
  validatePredictionInputBundle,
} from "./prediction-input-bundle-contract.js";
import { requirePredictionInputBundleEnvironment } from "./prediction-input-bundle-source.js";
import {
  predictionSettingsProjectionFromView,
  predictionSettingsViewFromOddsConfiguration,
} from "./prediction-settings-supabase.js";
import { loadSecondaryHistoryModel } from "./secondary-history-service.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function rpcData(read, label) {
  const payload = read?.payload || read || {};
  if (payload?.ok !== true || !payload?.data) {
    const error = new Error(`${label} is temporarily unavailable.`);
    error.code = clean(payload?.code || "PREDICTION_INPUT_BUNDLE_UPSTREAM_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return payload.data;
}

function verifiedSettingsView(configuration = {}, verification = null) {
  const view = predictionSettingsViewFromOddsConfiguration(configuration);
  if (!verification) return view;
  if (verification.trustCurrentSupabaseConfiguration === true) {
    if (view.configuration_is_current !== true || view.validation_status !== "VALID") {
      const error = new Error("The current Supabase Prediction Settings revision is not valid and current.");
      error.code = "PREDICTION_INPUT_SETTINGS_CURRENT_CONFIGURATION_REQUIRED";
      error.status = 503;
      throw error;
    }
    return { ...view, freshness: "CURRENT" };
  }
  const expectedSource = clean(verification.sourceFingerprint);
  const expectedEffective = clean(verification.effectiveSettingsFingerprint);
  const sourceMatches = !expectedSource || expectedSource === clean(view.source_fingerprint);
  const effectiveMatches = !expectedEffective || expectedEffective === clean(view.effective_settings_fingerprint);
  if (!sourceMatches || !effectiveMatches) {
    const error = new Error("Google and Supabase Prediction Settings fingerprints do not match.");
    error.code = "PREDICTION_INPUT_SETTINGS_VERIFICATION_MISMATCH";
    error.status = 409;
    error.diagnostics = {
      expectedSourceFingerprint: expectedSource,
      actualSourceFingerprint: clean(view.source_fingerprint),
      expectedEffectiveSettingsFingerprint: expectedEffective,
      actualEffectiveSettingsFingerprint: clean(view.effective_settings_fingerprint),
    };
    throw error;
  }
  return { ...view, freshness: "CURRENT" };
}

async function prepareUncached(options = {}) {
  const startedAt = performance.now();
  const env = options.env || process.env;
  const gate = requirePredictionInputBundleEnvironment(env);
  const dependencies = options.dependencies || {};
  const currentReader = dependencies.readOddsInputBundle || readOddsInputBundle;
  const historicalLoader = dependencies.loadSecondaryHistoryModel || loadSecondaryHistoryModel;
  const tournamentId = clean(options.tournamentId || "2026");

  const [currentRead, secondaryHistory] = await Promise.all([
    currentReader(tournamentId, { env, timeoutMs: options.timeoutMs || 20_000 }),
    historicalLoader({ env, timeoutMs: options.timeoutMs || 20_000 }),
  ]);
  const current = rpcData(currentRead, "Canonical current tournament and Prediction Settings");
  const predictionSettings = predictionSettingsProjectionFromView(verifiedSettingsView(
    current.input_configuration || {},
    options.settingsVerification || null
  ));
  const transformStartedAt = performance.now();
  const fullBundle = buildPredictionInputBundle({
    currentState: current.current_state,
    secondaryHistory,
    predictionSettings,
    scope: "full-diagnostic",
    allowUnknownSettingsFreshness: options.allowUnknownSettingsFreshness !== false,
  });
  const validation = validatePredictionInputBundle(fullBundle, {
    allowUnknownSettingsFreshness: options.allowUnknownSettingsFreshness !== false,
  });
  if (!validation.pass) {
    const error = new Error("Canonical Prediction input structural validation failed.");
    error.code = "PREDICTION_INPUT_BUNDLE_INVALID";
    error.status = 503;
    error.diagnostics = validation;
    throw error;
  }
  const scope = options.scope || "full-diagnostic";
  const bundle = scopePredictionInputBundle(fullBundle, scope);
  const serializedBytes = Buffer.byteLength(JSON.stringify(bundle));
  const transformMs = Math.max(0, performance.now() - transformStartedAt);
  return Object.freeze({
    bundle,
    validation,
    compatibility: predictionInputCompatibilityReport(fullBundle),
    diagnostics: {
      contract: fullBundle.metadata.contractVersion,
      scope,
      gate,
      directSupabaseRpcCalls: 1,
      composedSupabaseServiceCalls: 1,
      currentTournamentRpcMs: number(currentRead?.durationMs),
      secondaryHistoryServiceMs: number(secondaryHistory?.diagnostics?.totalServiceMs),
      databaseQueryMs: number(current.current_state?.query_ms),
      applicationTransformMs: transformMs,
      serializedBytes,
      bundleFingerprint: fullBundle.fingerprints.bundle,
      settingsFreshness: fullBundle.predictionSettings.freshness,
      totalPreparationMs: Math.max(0, performance.now() - startedAt),
      googleForegroundRequests: 0,
      noFallback: true,
      consumersChanged: 0,
    },
  });
}

const prepareCached = cache(() => prepareUncached());

/** Strict server-only Supabase preparation path; it never invokes Google. */
export async function preparePredictionInputBundle(options = {}) {
  return options.env || options.dependencies || options.timeoutMs || options.scope || options.settingsVerification || options.allowUnknownSettingsFreshness === false
    ? prepareUncached(options)
    : prepareCached();
}
