import { scoringShadowRpc } from "./scoring-shadow.js";
import { comparePredictionSettingsProjection } from "./prediction-settings-contract.js";

const clean = (value) => String(value ?? "").trim();

export const importPredictionSettingsProjection = (input, options = {}) => scoringShadowRpc(
  "import_preview_prediction_settings",
  { input },
  { ...options, timeoutMs: options.timeoutMs || 15_000 }
);

export const readPredictionSettingsProjection = (tournamentId = "", options = {}) => scoringShadowRpc(
  "read_preview_prediction_settings",
  { target_tournament_id: clean(tournamentId) },
  { ...options, timeoutMs: options.timeoutMs || 10_000 }
);

export function predictionSettingsProjectionFromView(view = {}) {
  const data = view?.data || view;
  return {
    tournamentId: clean(data.tournament_id),
    revision: Number(data.configuration_revision || 0),
    previousRevisionId: clean(data.previous_configuration_id),
    sourceWorkbookId: clean(data.source_workbook_id),
    sourceTab: clean(data.source_tab),
    sourceFingerprint: clean(data.source_fingerprint),
    rawSettingsFingerprint: clean(data.settings_fingerprint),
    effectiveSettingsFingerprint: clean(data.effective_settings_fingerprint),
    contractVersion: clean(data.settings_contract_version),
    sourceSettings: Array.isArray(data.source_settings) ? data.source_settings : [],
    canonicalSettings: data.canonical_settings || {},
    effectiveSettings: data.effective_settings || {},
    validationStatus: clean(data.validation_status),
    validationDiagnostics: data.validation_diagnostics || {},
    synchronizedAt: clean(data.synchronized_at),
    synchronizedBy: clean(data.synchronized_by),
    projectionStatus: clean(data.projection_status || "UNAVAILABLE"),
    freshness: clean(data.freshness || "UNKNOWN"),
  };
}

export async function loadCurrentPredictionSettings(tournamentId = "", options = {}) {
  const result = await readPredictionSettingsProjection(tournamentId, options);
  if (!result.payload?.ok) throw Object.assign(new Error("Prediction Settings projection is unavailable."), {
    code: result.payload?.code || "PREDICTION_SETTINGS_UNAVAILABLE",
    status: 503,
    diagnostics: result.payload?.data || null,
  });
  const projection = predictionSettingsProjectionFromView(result.payload.data);
  if (projection.projectionStatus !== "VALID") throw Object.assign(new Error("Prediction Settings projection is invalid."), {
    code: "PREDICTION_SETTINGS_INVALID",
    status: 503,
    diagnostics: projection,
  });
  return projection;
}

export function predictionSettingsFreshness({ stored, source, sourceError = null } = {}) {
  if (!stored) return { status: "UNAVAILABLE", reason: "NO_CERTIFIED_PROJECTION" };
  if (stored.projectionStatus !== "VALID" || stored.validationStatus !== "VALID") return { status: "INVALID", reason: "PROJECTION_VALIDATION_FAILED" };
  if (sourceError || !source) return { status: "UNKNOWN", reason: sourceError ? "GOOGLE_SOURCE_UNAVAILABLE" : "SOURCE_NOT_CHECKED" };
  const sourceFingerprint = clean(source.source_fingerprint || source.sourceFingerprint);
  const storedFingerprint = clean(stored.sourceFingerprint || stored.source_fingerprint);
  return sourceFingerprint === storedFingerprint
    ? { status: "CURRENT", reason: "SOURCE_FINGERPRINT_MATCH" }
    : { status: "STALE", reason: "NEWER_OR_DIFFERENT_GOOGLE_SOURCE", sourceFingerprint, storedFingerprint };
}

export function compareStoredPredictionSettings(sourceProjection = {}, storedProjection = {}) {
  return comparePredictionSettingsProjection(sourceProjection, {
    source_fingerprint: storedProjection.sourceFingerprint,
    settings_fingerprint: storedProjection.rawSettingsFingerprint,
    settings_contract_version: storedProjection.contractVersion,
    canonical_settings: storedProjection.canonicalSettings,
    effective_settings: storedProjection.effectiveSettings,
    effective_settings_fingerprint: storedProjection.effectiveSettingsFingerprint,
  });
}
