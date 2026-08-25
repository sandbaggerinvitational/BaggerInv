import "server-only";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";

/**
 * Server-only transport for the exact Production IDENTITY cutover phase.
 * Preview credentials and the legacy mirror transport are intentionally never
 * considered as fallbacks.
 */
export function productionCutoverParticipantAuthTransport(env = process.env) {
  const activation = assertProductionCutoverActivation({ env, requiredPhase: "IDENTITY" });
  const secretKey = String(env.PRODUCTION_SUPABASE_SECRET_KEY || "").trim();
  if (!secretKey) {
    const error = new Error("Production participant Auth server transport is unavailable.");
    error.code = "PRODUCTION_PARTICIPANT_AUTH_TRANSPORT_UNAVAILABLE";
    throw error;
  }
  return Object.freeze({
    url: PRODUCTION_SUPABASE_URL,
    projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    secretKey,
    deploymentCommit: activation.resources.commitSha,
    phase: activation.phase,
  });
}
