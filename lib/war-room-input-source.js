import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim().toLowerCase();
const fingerprint = (value) => String(value ?? "").trim().toLowerCase();

export const WAR_ROOM_INPUT_SOURCES = Object.freeze(["supabase"]);

/**
 * Cutover-grade Supabase reads must be pinned to the exact Prediction Settings
 * source and effective payloads that a Director independently certified. This
 * keeps ordinary War Room requests Google-free while failing closed when the
 * stored immutable projection advances or no longer matches that certification.
 */
export function requireWarRoomSettingsVerification(env = process.env) {
  const sourceFingerprint = fingerprint(env.WAR_ROOM_PREDICTION_SETTINGS_SOURCE_FINGERPRINT);
  const effectiveSettingsFingerprint = fingerprint(env.WAR_ROOM_PREDICTION_SETTINGS_EFFECTIVE_FINGERPRINT);
  if (!sourceFingerprint || !effectiveSettingsFingerprint) {
    const error = new Error("Supabase War Room input requires pinned certified Prediction Settings fingerprints.");
    error.code = "WAR_ROOM_PREDICTION_SETTINGS_VERIFICATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  for (const [field, value] of Object.entries({ sourceFingerprint, effectiveSettingsFingerprint })) {
    if (!/^[0-9a-f]{64}$/.test(value)) {
      const error = new Error(`Invalid ${field} for Supabase War Room Prediction Settings verification.`);
      error.code = "WAR_ROOM_PREDICTION_SETTINGS_VERIFICATION_INVALID";
      error.status = 503;
      throw error;
    }
  }
  return Object.freeze({ sourceFingerprint, effectiveSettingsFingerprint });
}

/** Canonical input only; no runtime or diagnostic switch can restore Google. */
export function resolveWarRoomInputSource(env = process.env, requestedSource = "") {
  const state = canonicalReadEnvironment(env, "WAR_ROOM_INPUT_SOURCE", {requiredPhase: "ODDS_WAR_ROOM"});
  if (state.blocked || (requestedSource && clean(requestedSource) !== "supabase")) {
    throw Object.assign(new Error("Canonical War Room input authority is unavailable."), {code: "WAR_ROOM_INPUT_SOURCE_INVALID", status: 503, diagnostics: state});
  }
  return Object.freeze({...state, contract: "war-room-input-source-v1", configured: state.requested,
    preview: state.previewDeployment, production: env.VERCEL_ENV === "production",
    productionHardResolvedToGoogle: false, overrideApplied: false});
}
