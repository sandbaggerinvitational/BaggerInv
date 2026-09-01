import "server-only";

import { preparePredictionInputBundle } from "./prediction-input-bundle-service.js";
import { loadSecondaryHistoryModel } from "./secondary-history-service.js";
import { buildWarRoomConsumerData } from "./war-room-input-contract.js";

export async function prepareSupabaseWarRoomInput({
  scope = "war-room",
  env = process.env,
  settingsVerification = null,
  timeoutMs = 20_000,
} = {}) {
  const startedAt = performance.now();
  let secondaryHistory = null;
  const prepared = await preparePredictionInputBundle({
    env,
    timeoutMs,
    scope: "full-diagnostic",
    settingsVerification,
    allowUnknownSettingsFreshness: false,
    dependencies: {
      loadSecondaryHistoryModel: async (options) => {
        secondaryHistory = await loadSecondaryHistoryModel(options);
        return secondaryHistory;
      },
    },
  });
  if (!secondaryHistory) {
    const error = new Error("Canonical secondary History context was not captured during bundle preparation.");
    error.code = "WAR_ROOM_SUPABASE_HISTORY_CONTEXT_REQUIRED";
    error.status = 503;
    throw error;
  }
  const transformStartedAt = performance.now();
  const consumerData = buildWarRoomConsumerData({
    bundle: prepared.bundle,
    calculations: secondaryHistory.calculations,
    scorecardAnalytics: secondaryHistory.scorecardAnalytics,
    scope,
  });
  const transformationMs = prepared.diagnostics.applicationTransformMs + Math.max(0, performance.now() - transformStartedAt);
  return Object.freeze({
    source: "supabase",
    bundle: prepared.bundle,
    consumerData,
    validation: prepared.validation,
    compatibility: prepared.compatibility,
    diagnostics: Object.freeze({
      adapterContract: "war-room-supabase-adapter-v1",
      directSupabaseRpcCalls: prepared.diagnostics.directSupabaseRpcCalls,
      composedSupabaseServiceCalls: prepared.diagnostics.composedSupabaseServiceCalls,
      currentTournamentRpcMs: prepared.diagnostics.currentTournamentRpcMs,
      secondaryHistoryServiceMs: prepared.diagnostics.secondaryHistoryServiceMs,
      databaseQueryMs: prepared.diagnostics.databaseQueryMs,
      googleForegroundRequests: 0,
      supabaseRequests: prepared.diagnostics.directSupabaseRpcCalls + prepared.diagnostics.composedSupabaseServiceCalls,
      fallbackUsed: false,
      acquisitionMs: prepared.diagnostics.currentTournamentRpcMs + prepared.diagnostics.secondaryHistoryServiceMs,
      transformationMs,
      serializationMs: 0,
      serializedBytes: Buffer.byteLength(JSON.stringify(consumerData)),
      totalPreparationMs: Math.max(0, performance.now() - startedAt),
      bundleContractVersion: prepared.bundle.metadata.contractVersion,
      factualFingerprint: prepared.bundle.fingerprints.bundle,
      settingsRevision: prepared.bundle.predictionSettings.revision,
      settingsFingerprint: prepared.bundle.predictionSettings.effectiveFingerprint,
      settingsFreshness: prepared.bundle.predictionSettings.freshness,
      orderingFingerprint: prepared.bundle.fingerprints.sections.ordering,
      evidencePolicyVersion: prepared.bundle.metadata.evidencePolicyVersion,
    }),
  });
}
