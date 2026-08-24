import { PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF } from "./completed-history-read-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";

const clean = (value) => String(value ?? "").trim();

/**
 * Step 7C is a Preview-only, server-side capability. It is deliberately not a
 * consumer source selector: no calculation surface is wired to this gate yet.
 */
export function predictionInputBundleEnvironment(env = process.env) {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const projectUrl = clean(env.SUPABASE_SCORING_MIRROR_URL);
  const projectApproved = candidate.eligible || projectUrl.includes(PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF);
  const credentialsConfigured = Boolean(projectUrl && clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const preview = deployment === "preview";
  const secondaryHistorySelected = clean(env.SECONDARY_HISTORY_READ_SOURCE).toLowerCase() === "supabase";
  const available = candidate.eligible || (preview && projectApproved && credentialsConfigured && secondaryHistorySelected);

  return {
    contract: "prediction-input-bundle-preview-gate-v1",
    available,
    preview,
    productionHardBlock: deployment === "production",
    projectApproved,
    credentialsConfigured,
    secondaryHistorySelected,
    productionShadowCandidate: candidate.eligible,
    projectRef: candidate.eligible ? candidate.projectRef
      : projectApproved ? PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF : "",
    reason: candidate.eligible
      ? "production-shadow-supabase-prediction-input-bundle"
      : !preview
      ? "preview-environment-required"
      : !projectApproved
        ? "preview-project-required"
        : !credentialsConfigured
          ? "credentials-missing"
          : !secondaryHistorySelected
            ? "secondary-history-supabase-required"
            : "preview-supabase-prediction-input-bundle",
  };
}

export function requirePredictionInputBundleEnvironment(env = process.env) {
  const state = predictionInputBundleEnvironment(env);
  if (!state.available) {
    const error = new Error(`Canonical Prediction inputs are unavailable (${state.reason}).`);
    error.code = state.productionHardBlock
      ? "PREDICTION_INPUT_BUNDLE_PRODUCTION_BLOCKED"
      : "PREDICTION_INPUT_BUNDLE_PREVIEW_CONFIGURATION_REQUIRED";
    error.status = 503;
    error.diagnostics = state;
    throw error;
  }
  return state;
}
