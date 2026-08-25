import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim().toLowerCase();
const fingerprint = (value) => String(value ?? "").trim().toLowerCase();

export const WAR_ROOM_INPUT_SOURCES = Object.freeze(["google", "supabase"]);

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

/**
 * One reversible War Room input boundary. Production is intentionally pinned
 * to the existing Google path; an explicit source override is accepted only
 * by protected Preview diagnostics.
 */
export function resolveWarRoomInputSource(env = process.env, requestedSource = "") {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const deployment = clean(env.VERCEL_ENV);
  const configured = clean(env.WAR_ROOM_INPUT_SOURCE) || "google";
  const requested = clean(requestedSource);
  const preview = deployment === "preview";
  const production = deployment === "production";

  if (configured && !WAR_ROOM_INPUT_SOURCES.includes(configured)) {
    const error = new Error(`Unsupported WAR_ROOM_INPUT_SOURCE ${configured}.`);
    error.code = "WAR_ROOM_INPUT_SOURCE_INVALID";
    error.status = 503;
    throw error;
  }
  if (requested && !WAR_ROOM_INPUT_SOURCES.includes(requested)) {
    const error = new Error(`Unsupported War Room diagnostic source ${requested}.`);
    error.code = "WAR_ROOM_INPUT_DIAGNOSTIC_SOURCE_INVALID";
    error.status = 400;
    throw error;
  }

  const cutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "WAR_ROOM_INPUT_SOURCE",
    configuredValue: configured,
    requiredPhase: "ODDS_WAR_ROOM",
  });
  if (cutover.handled) {
    if (cutover.blocked) {
      const error = new Error(`Production War Room inputs are unavailable (${cutover.reason}).`);
      error.code = cutover.failureCode;
      error.status = 503;
      error.diagnostics = cutover;
      throw error;
    }
    return Object.freeze({
      contract: "war-room-input-source-v1",
      requested: configured,
      configured,
      resolved: cutover.resolved,
      preview: false,
      production: true,
      productionShadowCandidate: false,
      productionCutover: cutover,
      productionHardResolvedToGoogle: false,
      overrideApplied: false,
      fallbackUsed: false,
    });
  }

  if (preview && candidate.requested && !candidate.eligible) {
    const error = new Error(`Production-shadow War Room inputs are unavailable (${candidate.reason}).`);
    error.code = "PRODUCTION_SHADOW_WAR_ROOM_CONFIGURATION_REQUIRED";
    error.status = 503;
    error.diagnostics = candidate;
    throw error;
  }
  if (preview && candidate.eligible && (configured !== "supabase" || (requested && requested !== "supabase"))) {
    const error = new Error("The Production-shadow candidate permits certified Supabase War Room inputs only.");
    error.code = "PRODUCTION_SHADOW_WAR_ROOM_SUPABASE_REQUIRED";
    error.status = 503;
    throw error;
  }

  const resolved = production ? "google"
    : candidate.eligible ? "supabase"
    : requested && preview ? requested : configured;
  return Object.freeze({
    contract: "war-room-input-source-v1",
    requested: requested || configured,
    configured,
    resolved,
    preview,
    production,
    productionShadowCandidate: candidate.eligible,
    productionHardResolvedToGoogle: production,
    overrideApplied: Boolean(requested && preview),
    fallbackUsed: false,
  });
}
