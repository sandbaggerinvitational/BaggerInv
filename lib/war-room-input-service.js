import "server-only";

import { comparePredictionInputBundles, predictionInputFingerprint } from "./prediction-input-bundle-contract.js";
import { prepareGoogleWarRoomInput } from "./war-room-input-google.js";
import { prepareSupabaseWarRoomInput } from "./war-room-input-supabase.js";
import { classifyWarRoomInputDifference, predictionBundleParityProjection } from "./war-room-input-contract.js";
import { requireWarRoomSettingsVerification, resolveWarRoomInputSource } from "./war-room-input-source.js";

export async function prepareWarRoomInput({
  scope = "war-room",
  requestedSource = "",
  env = process.env,
  settingsVerification = null,
  timeoutMs = 20_000,
} = {}) {
  const selection = resolveWarRoomInputSource(env, requestedSource);
  const productionCanonicalSettings = selection.resolved === "supabase" &&
    selection.production === true && Boolean(selection.productionCutover?.handled);
  const resolvedSettingsVerification = selection.resolved === "supabase"
    ? settingsVerification || (productionCanonicalSettings
      ? { trustCurrentSupabaseConfiguration: true }
      : requireWarRoomSettingsVerification(env))
    : null;
  const settingsVerificationMode = selection.resolved !== "supabase"
    ? "NOT_REQUIRED_GOOGLE"
    : settingsVerification
      ? "EXPLICIT_PAIRED_CAPTURE"
      : productionCanonicalSettings
        ? "CURRENT_SUPABASE_CONFIGURATION"
        : "PINNED_PREVIEW_CONFIGURATION";
  const prepared = selection.resolved === "supabase"
    ? await prepareSupabaseWarRoomInput({ scope, env, settingsVerification: resolvedSettingsVerification, timeoutMs })
    : await prepareGoogleWarRoomInput({ scope });
  return Object.freeze({
    ...prepared,
    selection,
    diagnostics: Object.freeze({
      ...prepared.diagnostics,
      requestedSource: selection.requested,
      configuredSource: selection.configured,
      resolvedSource: selection.resolved,
      productionHardResolvedToGoogle: selection.productionHardResolvedToGoogle,
      settingsVerificationMode,
      fallbackUsed: false,
    }),
  });
}

export async function captureWarRoomInputParity({
  scope = "full-diagnostic",
  env = process.env,
  timeoutMs = 30_000,
} = {}) {
  const capturedAt = new Date().toISOString();
  const google = await prepareWarRoomInput({ scope, requestedSource: "google", env, timeoutMs });
  const settingsVerification = {
    sourceFingerprint: google.bundle.predictionSettings.sourceFingerprint,
    effectiveSettingsFingerprint: google.bundle.predictionSettings.effectiveFingerprint,
  };
  const supabase = await prepareWarRoomInput({ scope, requestedSource: "supabase", env, timeoutMs, settingsVerification });
  const googleProjection = predictionBundleParityProjection(google.bundle);
  const supabaseProjection = predictionBundleParityProjection(supabase.bundle);
  const compared = comparePredictionInputBundles(googleProjection, supabaseProjection);
  const differences = compared.differences.map(classifyWarRoomInputDifference);
  const unexplained = differences.filter((row) => row.disposition === "UNEXPLAINED");
  const intentional = differences.filter((row) => row.disposition !== "UNEXPLAINED");
  const classifications = ["VALUE", "TYPE", "NULLABILITY", "ORDER", "EVIDENCE", "IDENTITY", "REVISION", "CONFIGURATION"];
  return Object.freeze({
    contract: "war-room-input-parity-v1",
    capturedAt,
    selectedRuntimeSource: resolveWarRoomInputSource(env).resolved,
    calculationConsumersChanged: 0,
    snapshots: {
      google: {
        source: "google",
        fingerprint: predictionInputFingerprint(googleProjection),
        bundleFingerprint: google.bundle.fingerprints.bundle,
        settingsFingerprint: google.bundle.predictionSettings.effectiveFingerprint,
        orderingFingerprint: google.bundle.fingerprints.sections.ordering,
      },
      supabase: {
        source: "supabase",
        fingerprint: predictionInputFingerprint(supabaseProjection),
        bundleFingerprint: supabase.bundle.fingerprints.bundle,
        settingsFingerprint: supabase.bundle.predictionSettings.effectiveFingerprint,
        orderingFingerprint: supabase.bundle.fingerprints.sections.ordering,
      },
    },
    parity: {
      pass: unexplained.length === 0,
      totalDifferences: differences.length,
      unexplainedDifferences: unexplained.length,
      intentionalDifferences: intentional.length,
      counts: Object.fromEntries(classifications.map((classification) => [classification, differences.filter((row) => row.classification === classification).length])),
      unexplainedCounts: Object.fromEntries(classifications.map((classification) => [classification, unexplained.filter((row) => row.classification === classification).length])),
      intentionalReasonCounts: Object.fromEntries([...new Set(intentional.map((row) => row.reason))].sort()
        .map((reason) => [reason, intentional.filter((row) => row.reason === reason).length])),
      differences,
    },
    settings: {
      pass: google.bundle.predictionSettings.effectiveFingerprint === supabase.bundle.predictionSettings.effectiveFingerprint &&
        supabase.bundle.predictionSettings.freshness === "CURRENT",
      google: google.bundle.predictionSettings,
      supabase: supabase.bundle.predictionSettings,
    },
    zeroGoogleSupabaseShadow: supabase.diagnostics.googleForegroundRequests === 0 && supabase.diagnostics.fallbackUsed === false,
    performance: { google: google.diagnostics, supabase: supabase.diagnostics },
  });
}
